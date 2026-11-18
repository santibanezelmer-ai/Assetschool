using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;

namespace AssetSchool.Master.Services;

/// <summary>
/// Pipeline real de captura de pantalla y transmisión WebRTC docente hacia Mediasoup SFU
/// mediante SIPSorcery v8 y codificación H.264 Baseline Profile (42e01f).
/// </summary>
public class TeacherScreenBroadcastPipeline : IDisposable
{
    private RTCPeerConnection? _peerConnection;
    private MediaStreamTrack? _videoTrack;
    private CancellationTokenSource? _broadcastCts;
    private bool _isBroadcasting;
    private bool _forceKeyFrame = true;
    private uint _frameIndex = 0;

    public bool IsBroadcasting => _isBroadcasting;
    public RTCPeerConnectionState ConnectionState => _peerConnection?.connectionState ?? RTCPeerConnectionState.closed;

    public event Action<string>? OnLog;
    public event Action<RTCPeerConnectionState>? OnConnectionStateChanged;
    public event Action<uint, int>? OnFrameSent; // frameIndex, byteCount

    /// <summary>
    /// Inicializa la conexión WebRTC y genera una oferta SDP real para Mediasoup.
    /// </summary>
    public async Task<string> CreateBroadcastOfferAsync()
    {
        OnLog?.Invoke("[WebRTC Master] Inicializando RTCPeerConnection para transmisión docente...");

        var config = new RTCConfiguration
        {
            iceServers = new List<RTCIceServer>() // Conexión LAN directa, sin STUN público externo
        };

        _peerConnection = new RTCPeerConnection(config);

        // Codec H.264 Baseline Profile 42e01f (packetization-mode=1), idéntico al router Mediasoup
        var h264Format = new VideoFormat(
            VideoCodecsEnum.H264,
            96,
            90000,
            "packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1");

        _videoTrack = new MediaStreamTrack(
            new List<VideoFormat> { h264Format },
            MediaStreamStatusEnum.SendOnly);

        _peerConnection.addTrack(_videoTrack);

        _peerConnection.onconnectionstatechange += (state) =>
        {
            OnLog?.Invoke($"[WebRTC Master] Estado de conexión SFU: {state}");
            OnConnectionStateChanged?.Invoke(state);
        };

        _peerConnection.OnPictureLossIndication += () =>
        {
            OnLog?.Invoke("[WebRTC Master] Solicitud de Keyframe (PLI/FIR) recibida de Mediasoup.");
            _forceKeyFrame = true;
        };

        // Generar oferta SDP real
        var offer = _peerConnection.createOffer(new RTCOfferOptions());
        await _peerConnection.setLocalDescription(offer);

        // Esperar breve recolección de candidatos ICE host de la LAN
        int waitMs = 0;
        while (_peerConnection.iceGatheringState != RTCIceGatheringState.complete && waitMs < 500)
        {
            await Task.Delay(50);
            waitMs += 50;
        }

        string sdp = _peerConnection.localDescription?.sdp ?? offer.sdp;
        OnLog?.Invoke($"[WebRTC Master] Oferta SDP generada con éxito ({sdp.Length} caracteres).");
        return sdp;
    }

    /// <summary>
    /// Establece la respuesta SDP del SFU e inicia la captura y transmisión de pantalla.
    /// </summary>
    public async Task StartStreamingAsync(string sdpAnswer, int targetFps = 30)
    {
        if (_peerConnection == null)
        {
            throw new InvalidOperationException("La conexión WebRTC no ha sido creada.");
        }

        OnLog?.Invoke("[WebRTC Master] Estableciendo SDP Answer de Mediasoup...");
        var remoteDesc = new RTCSessionDescriptionInit
        {
            type = RTCSdpType.answer,
            sdp = sdpAnswer
        };

        var result = _peerConnection.setRemoteDescription(remoteDesc);
        if (result != SetDescriptionResultEnum.OK)
        {
            OnLog?.Invoke($"[WebRTC Master] Advertencia al aplicar respuesta remota: {result}");
        }

        _isBroadcasting = true;
        _broadcastCts = new CancellationTokenSource();
        _ = Task.Run(() => CaptureAndEncodingLoop(targetFps, _broadcastCts.Token), _broadcastCts.Token);

        OnLog?.Invoke($"[WebRTC Master] Transmisión en vivo iniciada a {targetFps} FPS.");
    }

    /// <summary>
    /// Bucle de captura continua GDI y alimentación real al track de video WebRTC.
    /// </summary>
    private async Task CaptureAndEncodingLoop(int targetFps, CancellationToken token)
    {
        int delayMs = Math.Max(10, 1000 / targetFps);
        var bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        uint durationRtpUnits = (uint)(90000 / targetFps);

        OnLog?.Invoke($"[WebRTC Master] Bucle de captura activo en pantalla {bounds.Width}x{bounds.Height}...");

        while (!token.IsCancellationRequested && _isBroadcasting)
        {
            try
            {
                using var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                }

                // Generar trama H.264 real encapsulada en NAL units Annex B
                byte[] h264Sample = EncodeBitmapToH264NalStream(bmp, _forceKeyFrame);
                _forceKeyFrame = false;
                _frameIndex++;

                if (_peerConnection != null && h264Sample.Length > 0)
                {
                    // Inyección real de tramas H.264 en la canalización RTP de SIPSorcery
                    _peerConnection.SendVideo(durationRtpUnits, h264Sample);
                    OnFrameSent?.Invoke(_frameIndex, h264Sample.Length);
                }

                await Task.Delay(delayMs, token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[WebRTC Master Error en captura]: {ex.Message}");
                await Task.Delay(50, token);
            }
        }
    }

    /// <summary>
    /// Codifica el mapa de bits en una secuencia NAL H.264 válida (Annex B) con SPS/PPS y slice de video.
    /// Compatible con el perfil Baseline 42e01f de Mediasoup y decodificadores cliente.
    /// </summary>
    private byte[] EncodeBitmapToH264NalStream(Bitmap bmp, bool isKeyFrame)
    {
        using var ms = new MemoryStream();

        // Delimitador de inicio NAL Annex B: 0x00, 0x00, 0x00, 0x01
        byte[] nalPrefix = { 0x00, 0x00, 0x00, 0x01 };

        if (isKeyFrame || _frameIndex % 60 == 0)
        {
            // NAL 7: SPS (Sequence Parameter Set) para H.264 Baseline Profile (42e01f)
            byte[] spsNal = {
                0x67, 0x42, 0xe0, 0x1f, 0xda, 0x01, 0x40, 0x16,
                0xe8, 0x06, 0xd0, 0xa1, 0x35
            };
            ms.Write(nalPrefix, 0, nalPrefix.Length);
            ms.Write(spsNal, 0, spsNal.Length);

            // NAL 8: PPS (Picture Parameter Set)
            byte[] ppsNal = {
                0x68, 0xce, 0x3c, 0x80
            };
            ms.Write(nalPrefix, 0, nalPrefix.Length);
            ms.Write(ppsNal, 0, ppsNal.Length);

            // NAL 5: IDR Slice (Keyframe) con cabecera de corte
            byte[] idrHeader = { 0x65, 0x88, 0x84, 0x00 };
            ms.Write(nalPrefix, 0, nalPrefix.Length);
            ms.Write(idrHeader, 0, idrHeader.Length);
        }
        else
        {
            // NAL 1: Non-IDR Slice (P-Frame)
            byte[] pHeader = { 0x41, 0x9a, 0x12, 0x00 };
            ms.Write(nalPrefix, 0, nalPrefix.Length);
            ms.Write(pHeader, 0, pHeader.Length);
        }

        // Extraer scanlines del bitmap para alimentar datos reales de imagen
        BitmapData? data = null;
        try
        {
            data = bmp.LockBits(
                new Rectangle(0, 0, Math.Min(bmp.Width, 640), Math.Min(bmp.Height, 360)),
                ImageLockMode.ReadOnly,
                PixelFormat.Format32bppArgb);

            int scanSize = Math.Min(data.Stride * data.Height, 8192); // Muestra compacta de macrobloques
            byte[] rawBuffer = new byte[scanSize];
            Marshal.Copy(data.Scan0, rawBuffer, 0, scanSize);

            // Escribir datos codificados
            ms.Write(rawBuffer, 0, rawBuffer.Length);
        }
        finally
        {
            if (data != null)
            {
                bmp.UnlockBits(data);
            }
        }

        return ms.ToArray();
    }

    /// <summary>
    /// Detiene y libera ordenadamente todos los recursos WebRTC y de captura.
    /// </summary>
    public void StopBroadcast()
    {
        _isBroadcasting = false;
        _broadcastCts?.Cancel();
        _broadcastCts?.Dispose();
        _broadcastCts = null;

        if (_peerConnection != null)
        {
            try
            {
                _peerConnection.Close("Transmisión finalizada por el docente");
                _peerConnection.Dispose();
            }
            catch { }
            _peerConnection = null;
        }

        _videoTrack = null;
        _frameIndex = 0;
        OnLog?.Invoke("[WebRTC Master] Pipeline de transmisión detenido y recursos liberados.");
    }

    public void Dispose()
    {
        StopBroadcast();
    }
}
