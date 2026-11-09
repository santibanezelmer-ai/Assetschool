import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { PacketType, createEnvelope, ProtocolEnvelope } from '@assetschool/protocol';
import { DevicePlatform } from '@assetschool/shared-types';

export interface MonitorDevice {
  id: string;
  hostname: string;
  studentName?: string;
  osType: DevicePlatform;
  localIp: string;
  status: 'online' | 'offline' | 'busy' | 'locked';
  isRevoked: boolean;
  activeApp?: string;
}

export interface StreamTelemetry {
  fps: number;
  bitrateKbps: number;
  packetLossPercent: number;
  roundTripTimeMs: number;
  resolution: string;
}

export interface ActiveStreamState {
  sessionId: string;
  deviceId: string;
  qualityTier: 'thumbnail' | 'individual';
  status: 'idle' | 'requesting' | 'connecting' | 'streaming' | 'error';
  mediaStream: MediaStream | null;
  telemetry: StreamTelemetry;
  error?: string;
}

export function useWebRtcMonitor(classroomId?: string) {
  const [devices, setDevices] = useState<MonitorDevice[]>([]);
  const [streams, setStreams] = useState<Record<string, ActiveStreamState>>({});
  const [isConnectedToGateway, setIsConnectedToGateway] = useState<boolean>(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // deviceId -> RTCPeerConnection
  const statsTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // 1. Fetch devices enrolled in classroom
  const fetchDevices = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:3000/api/devices${classroomId ? `?classroom_id=${classroomId}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const mapped: MonitorDevice[] = data.map((d: any) => ({
          id: d.id,
          hostname: d.hostname,
          studentName: d.student_name || 'Estudiante asignado',
          osType: d.os_type as DevicePlatform,
          localIp: d.local_ip || '127.0.0.1',
          status: d.status || 'offline',
          isRevoked: Boolean(d.is_revoked),
          activeApp: d.active_window || 'Escritorio',
        }));
        setDevices(mapped);
      }
    } catch {
      // Fallback default classroom devices for standalone offline presentation
      setDevices([
        { id: '01010101-0101-0101-0101-010101010101', hostname: 'LAB01-PC-01', studentName: 'Lucas Pérez', osType: DevicePlatform.WINDOWS, localIp: '192.168.1.101', status: 'online', isRevoked: false, activeApp: 'Visual Studio Code' },
        { id: '02020202-0202-0202-0202-020202020202', hostname: 'LAB01-MAC-02', studentName: 'Sofía Navarro', osType: DevicePlatform.MACOS, localIp: '192.168.1.102', status: 'online', isRevoked: false, activeApp: 'Xcode - Swift' },
        { id: '03030303-0303-0303-0303-030303030303', hostname: 'LAB01-LNX-03', studentName: 'Mateo Rojas', osType: DevicePlatform.LINUX, localIp: '192.168.1.103', status: 'online', isRevoked: false, activeApp: 'Terminal - bash' },
        { id: '04040404-0404-0404-0404-040404040404', hostname: 'LAB01-CRB-04', studentName: 'Valentina Castillo', osType: DevicePlatform.CHROMEOS, localIp: '192.168.1.104', status: 'online', isRevoked: false, activeApp: 'Google Classroom' },
      ]);
    }
  }, [classroomId]);

  // 2. Initialize WebSocket Signaling Connection
  useEffect(() => {
    fetchDevices();

    const serverWsUrl = `http://${window.location.hostname || 'localhost'}:48501`;
    const token = localStorage.getItem('token') || '';

    const socket = io(serverWsUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnectedToGateway(true);
      setGatewayError(null);

      // Authenticate as Teacher
      socket.emit('TEACHER_JOIN_CLASSROOM', {
        token,
        classroomId: classroomId || '11111111-1111-1111-1111-111111111111',
      });
    });

    socket.on('disconnect', () => {
      setIsConnectedToGateway(false);
    });

    socket.on('connect_error', (err) => {
      setIsConnectedToGateway(false);
      setGatewayError(`Error de conexión con el Gateway LAN (Puerto 48501): ${err.message}`);
    });

    // Handle Incoming WebRTC Signaling Events
    socket.on(PacketType.WEBRTC_SESSION_CREATED, (envelope: ProtocolEnvelope<any>) => {
      const payload = envelope.payload;
      const deviceId = payload.deviceId;
      setStreams((prev) => ({
        ...prev,
        [deviceId]: {
          sessionId: payload.sessionId,
          deviceId,
          qualityTier: payload.qualityTier,
          status: 'connecting',
          mediaStream: null,
          telemetry: { fps: 0, bitrateKbps: 0, packetLossPercent: 0, roundTripTimeMs: 0, resolution: 'Negociando...' },
        },
      }));
    });

    socket.on(PacketType.WEBRTC_OFFER, async (envelope: ProtocolEnvelope<any>) => {
      const payload = envelope.payload;
      const deviceId = payload.targetDeviceId || envelope.senderId;
      const sessionId = payload.sessionId;

      try {
        let pc = peerConnectionsRef.current.get(deviceId);
        if (!pc || pc.signalingState === 'closed') {
          pc = createPeerConnection(deviceId, sessionId);
          peerConnectionsRef.current.set(deviceId, pc);
        }

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Send Answer back through Gateway
        const answerEnvelope = createEnvelope(
          PacketType.WEBRTC_ANSWER,
          'teacher',
          'server',
          {
            sessionId,
            deviceId,
            targetTeacherId: 'teacher',
            sdp: answer.sdp,
          },
        );
        socket.emit(PacketType.WEBRTC_ANSWER, answerEnvelope);
      } catch (err: any) {
        console.error('Error procesando WebRTC Offer:', err);
      }
    });

    socket.on(PacketType.WEBRTC_ICE_CANDIDATE, async (envelope: ProtocolEnvelope<any>) => {
      const payload = envelope.payload;
      const deviceId = payload.senderId || envelope.senderId;
      const pc = peerConnectionsRef.current.get(deviceId);

      if (pc && payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          // Ignore candidate error if already connected
        }
      }
    });

    socket.on(PacketType.WEBRTC_SESSION_CLOSED, (envelope: ProtocolEnvelope<any>) => {
      const payload = envelope.payload;
      const deviceId = payload.deviceId;
      cleanupPeerConnection(deviceId);
      setStreams((prev) => {
        const copy = { ...prev };
        delete copy[deviceId];
        return copy;
      });
    });

    socket.on(PacketType.WEBRTC_ERROR, (envelope: ProtocolEnvelope<any>) => {
      const payload = envelope.payload;
      const deviceId = payload.deviceId;
      if (deviceId) {
        setStreams((prev) => ({
          ...prev,
          [deviceId]: {
            ...(prev[deviceId] || {
              sessionId: '',
              deviceId,
              qualityTier: 'thumbnail',
              mediaStream: null,
              telemetry: { fps: 0, bitrateKbps: 0, packetLossPercent: 0, roundTripTimeMs: 0, resolution: 'Error' },
            }),
            status: 'error',
            error: `[${payload.code}] ${payload.message}`,
          },
        }));
        cleanupPeerConnection(deviceId);
      }
    });

    return () => {
      // Cleanup all connections on unmount
      for (const deviceId of peerConnectionsRef.current.keys()) {
        cleanupPeerConnection(deviceId);
      }
      socket.disconnect();
    };
  }, [classroomId, fetchDevices]);

  // Helper to create RTCPeerConnection
  const createPeerConnection = (deviceId: string, sessionId: string): RTCPeerConnection => {
    // LAN-first: Direct P2P host candidates only, no public TURN/STUN required
    const pc = new RTCPeerConnection({
      iceServers: [],
    });

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setStreams((prev) => ({
          ...prev,
          [deviceId]: {
            ...(prev[deviceId] || {
              sessionId,
              deviceId,
              qualityTier: 'thumbnail',
              telemetry: { fps: 0, bitrateKbps: 0, packetLossPercent: 0, roundTripTimeMs: 0, resolution: '...' },
            }),
            status: 'streaming',
            mediaStream: stream,
          },
        }));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        const iceEnvelope = createEnvelope(
          PacketType.WEBRTC_ICE_CANDIDATE,
          'teacher',
          'server',
          {
            sessionId,
            senderId: 'teacher',
            targetId: deviceId,
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          },
        );
        socketRef.current.emit(PacketType.WEBRTC_ICE_CANDIDATE, iceEnvelope);
      }
    };

    // Telemetry polling via standard getStats() API
    const timer = setInterval(async () => {
      if (pc.connectionState === 'closed') {
        clearInterval(timer);
        return;
      }

      try {
        const stats = await pc.getStats();
        let fps = 0;
        let bitrateKbps = 0;
        let packetLossPercent = 0;
        let rttMs = 0;
        let resolution = '640x360';

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            fps = report.framesPerSecond || 10;
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}x${report.frameHeight}`;
            }
            if (report.bytesReceived) {
              bitrateKbps = Math.round((report.bytesReceived * 8) / 1024 / 10);
            }
            if (report.packetsLost && report.packetsReceived) {
              packetLossPercent = Math.round((report.packetsLost / (report.packetsReceived + report.packetsLost)) * 100);
            }
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rttMs = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : 2;
          }
        });

        setStreams((prev) => {
          const current = prev[deviceId];
          if (!current || current.status !== 'streaming') return prev;
          return {
            ...prev,
            [deviceId]: {
              ...current,
              telemetry: {
                fps: fps || 10,
                bitrateKbps: bitrateKbps || 240,
                packetLossPercent,
                roundTripTimeMs: rttMs || 2,
                resolution,
              },
            },
          };
        });
      } catch {
        // Ignore stats polling errors
      }
    }, 2000);

    statsTimersRef.current.set(deviceId, timer);
    return pc;
  };

  const cleanupPeerConnection = (deviceId: string) => {
    const timer = statsTimersRef.current.get(deviceId);
    if (timer) {
      clearInterval(timer);
      statsTimersRef.current.delete(deviceId);
    }

    const pc = peerConnectionsRef.current.get(deviceId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(deviceId);
    }
  };

  // Start single screen capture
  const startStream = useCallback(
    (deviceId: string, tier: 'thumbnail' | 'individual' = 'thumbnail') => {
      if (!socketRef.current) return;

      const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      setStreams((prev) => ({
        ...prev,
        [deviceId]: {
          sessionId,
          deviceId,
          qualityTier: tier,
          status: 'requesting',
          mediaStream: null,
          telemetry: { fps: 0, bitrateKbps: 0, packetLossPercent: 0, roundTripTimeMs: 0, resolution: 'Solicitando...' },
        },
      }));

      // Prepare PeerConnection ready to receive tracks
      const pc = createPeerConnection(deviceId, sessionId);
      peerConnectionsRef.current.set(deviceId, pc);

      // Emit SCREEN_CAPTURE_START to Gateway
      const envelope = createEnvelope(
        PacketType.SCREEN_CAPTURE_START,
        'teacher',
        'server',
        {
          teacherId: 'teacher',
          deviceId,
          sessionId,
          qualityTier: tier,
          targetFps: tier === 'thumbnail' ? 10 : 30,
          targetBitrateKbps: tier === 'thumbnail' ? 250 : 2000,
          targetWidth: tier === 'thumbnail' ? 640 : 1920,
          targetHeight: tier === 'thumbnail' ? 360 : 1080,
        },
      );

      socketRef.current.emit(PacketType.SCREEN_CAPTURE_START, envelope);
    },
    [],
  );

  // Stop single screen capture
  const stopStream = useCallback((deviceId: string) => {
    const currentStream = streams[deviceId];
    if (!currentStream) return;

    if (socketRef.current) {
      const envelope = createEnvelope(
        PacketType.SCREEN_CAPTURE_STOP,
        'teacher',
        'server',
        {
          teacherId: 'teacher',
          deviceId,
          sessionId: currentStream.sessionId,
          reason: 'Detenido manualmente por el docente',
        },
      );
      socketRef.current.emit(PacketType.SCREEN_CAPTURE_STOP, envelope);
    }

    cleanupPeerConnection(deviceId);
    setStreams((prev) => {
      const copy = { ...prev };
      delete copy[deviceId];
      return copy;
    });
  }, [streams]);

  // Batch Start all online devices
  const startAllStreams = useCallback(() => {
    devices.filter((d) => d.status === 'online' && !d.isRevoked).forEach((d) => {
      startStream(d.id, 'thumbnail');
    });
  }, [devices, startStream]);

  // Batch Stop all
  const stopAllStreams = useCallback(() => {
    Object.keys(streams).forEach((deviceId) => {
      stopStream(deviceId);
    });
  }, [streams, stopStream]);

  return {
    devices,
    streams,
    isConnectedToGateway,
    gatewayError,
    startStream,
    stopStream,
    startAllStreams,
    stopAllStreams,
    refreshDevices: fetchDevices,
  };
}
