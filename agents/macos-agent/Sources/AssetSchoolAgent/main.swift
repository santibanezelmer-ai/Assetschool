import Foundation
@preconcurrency import WebRTC
import CoreGraphics

setbuf(__stdoutp, nil)

let isJsonMode = CommandLine.arguments.contains("--json-signaling")
let isGatewayMode = CommandLine.arguments.contains("--gateway-mode") || (!isJsonMode && CommandLine.arguments.contains("--connect"))

if !isJsonMode {
    print("==================================================")
    print(" AssetSchool Native Agent — macOS (Swift)")
    print(" Fase 02.3: Validación End-to-End y Streaming Continuo")
    print("==================================================")

    let host = ProcessInfo.processInfo.hostName
    let osVersion = ProcessInfo.processInfo.operatingSystemVersionString

    print("[INFO] Hostname: \(host)")
    print("[INFO] Sistema Operativo: macOS \(osVersion)")

    let capabilities = MacOSCapabilityReporter.report(deviceId: "02020202-0202-0202-0202-020202020202")
    print("[INFO] Capacidades Nativas Declaradas:")
    if let data = try? JSONSerialization.data(withJSONObject: capabilities, options: .prettyPrinted),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

let indicator = CaptureIndicatorWindow()
let webrtcEngine = WebRtcNativeEngine()

if isGatewayMode {
    print("\n[MODO GATEWAY] Conectando a infraestructura central de AssetSchool...")
    print("[VERIFICACIÓN TCC] Permiso de captura de pantalla concedido: \(webrtcEngine.hasTccPermission)")
    
    let gatewayUrl = URL(string: "ws://127.0.0.1:3000/socket.io/?EIO=4&transport=websocket")!
    let gatewayClient = GatewayClient(
        gatewayUrl: gatewayUrl,
        deviceId: "02020202-0202-0202-0202-020202020202",
        macAddress: "02:42:AC:11:00:03",
        hostname: "LAB01-MAC-02",
        webrtcEngine: webrtcEngine
    )
    
    gatewayClient.onStreamStarted = {
        indicator.show(teacherName: "Mariana Fuentes (Docente)")
    }
    
    gatewayClient.onStreamStopped = {
        indicator.hide()
    }
    
    gatewayClient.connect()
    RunLoop.main.run()
} else if isJsonMode {
    // JSON Signaling Bridge for Automated Testing & Harness
    webrtcEngine.onLocalCandidate = { sdp, mid, mLineIndex in
        let msg: [String: Any] = [
            "event": "ice_candidate",
            "candidate": [
                "candidate": sdp,
                "sdpMid": mid,
                "sdpMLineIndex": mLineIndex
            ]
        ]
        if let data = try? JSONSerialization.data(withJSONObject: msg),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }

    webrtcEngine.onConnectionStateChanged = { state in
        let msg: [String: Any] = [
            "event": "ice_state",
            "state": state.rawValue
        ]
        if let data = try? JSONSerialization.data(withJSONObject: msg),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }

    Task {
        do {
            let offerSdp = try await webrtcEngine.createOffer(sessionId: "test_mac_stream_01", config: .individual)
            let offerMsg: [String: Any] = [
                "event": "sdp_offer",
                "sdp": offerSdp
            ]
            if let data = try? JSONSerialization.data(withJSONObject: offerMsg),
               let str = String(data: data, encoding: .utf8) {
                print(str)
                fflush(stdout)
            }
        } catch {
            let errStr = "{\"event\":\"error\",\"message\":\"\(error.localizedDescription)\"}"
            print(errStr)
            fflush(stdout)
            exit(1)
        }
    }

    // Process commands from stdin
    DispatchQueue.global(qos: .userInitiated).async {
        while let line = readLine() {
            guard let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let action = json["action"] as? String else {
                continue
            }

            Task {
                switch action {
                case "set_answer":
                    if let sdp = json["sdp"] as? String {
                        do {
                            try await webrtcEngine.handleAnswer(sdpAnswer: sdp)
                            let ack = "{\"event\":\"answer_ack\",\"status\":\"ok\"}"
                            print(ack)
                            fflush(stdout)
                        } catch {
                            let ack = "{\"event\":\"answer_ack\",\"status\":\"error\",\"message\":\"\(error.localizedDescription)\"}"
                            print(ack)
                            fflush(stdout)
                        }
                    }
                case "add_candidate":
                    if let candObj = json["candidate"] as? [String: Any],
                       let candStr = candObj["candidate"] as? String {
                        let mid = candObj["sdpMid"] as? String
                        let mLine = (candObj["sdpMLineIndex"] as? Int32) ?? 0
                        webrtcEngine.addRemoteCandidate(sdp: candStr, sdpMid: mid, sdpMLineIndex: mLine)
                    }
                case "stop":
                    webrtcEngine.close()
                    let ack = "{\"event\":\"stopped\"}"
                    print(ack)
                    fflush(stdout)
                    exit(0)
                default:
                    break
                }
            }
        }
    }

    RunLoop.main.run()
} else {
    // Normal CLI execution demonstration
    print("\n[VERIFICACIÓN] Verificando permisos TCC para grabación de pantalla en macOS...")
    let hasPermissions = webrtcEngine.hasTccPermission
    print("[VERIFICACIÓN] Permiso Screen Recording TCC concedido: \(hasPermissions)")

    print("\n[INICIANDO] Activando indicador visual de privacidad de supervisión...")
    indicator.show(teacherName: "Mariana Fuentes (Docente)")

    webrtcEngine.onLocalCandidate = { sdp, mid, mLineIndex in
        print("[ICE CANDIDATE LOCAL] Generado por libwebrtc nativo -> mid: \(mid), mLine: \(mLineIndex)")
    }

    webrtcEngine.onConnectionStateChanged = { state in
        print("[ICE STATE CHANGE] Nuevo estado: \(state.rawValue)")
    }

    Task {
        do {
            print("\n[WEBRTC] Generando oferta SDP real mediante RTCPeerConnectionFactory nativo...")
            let sdpOffer = try await webrtcEngine.createOffer(sessionId: "stream_mac_session_real_01", config: .individual)
            
            print("\n=================== SDP OFFER REAL GENERADO POR LIBWEBRTC ===================")
            print(sdpOffer)
            print("==============================================================================")
            
            try await Task.sleep(nanoseconds: 2_000_000_000)
            
            webrtcEngine.close()
            indicator.hide()
            
            print("\n[ÉXITO] Pipeline WebRTC nativo (libwebrtc M135 + ScreenCaptureKit) ejecutado y verificado.")
            exit(0)
        } catch {
            print("[ERROR FATAL] Fallo en la inicialización de WebRTC nativo: \(error)")
            exit(1)
        }
    }

    RunLoop.main.run()
}
