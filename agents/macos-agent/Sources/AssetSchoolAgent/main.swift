import Foundation

print("==================================================")
print(" AssetSchool Native Agent — macOS (Swift)")
print(" Fase 02: ScreenCaptureKit & WebRTC LAN Streaming")
print("==================================================")

let host = ProcessInfo.processInfo.hostName
let osVersion = ProcessInfo.processInfo.operatingSystemVersionString

print("[INFO] Hostname: \(host)")
print("[INFO] Sistema Operativo: macOS \(osVersion)")

let capabilities = MacOSCapabilityReporter.report(deviceId: "pending-enrollment")
print("[INFO] Capacidades Nativas Declaradas:")
if let data = try? JSONSerialization.data(withJSONObject: capabilities, options: .prettyPrinted),
   let str = String(data: data, encoding: .utf8) {
    print(str)
}

let captureManager = ScreenCaptureKitManager()
let indicator = CaptureIndicatorWindow()
let webrtcEngine = WebRtcLANEngine()

print("\n[VERIFICACIÓN] Verificando permisos TCC para grabación de pantalla...")
let hasPermissions = captureManager.checkTccPermissions()
print("[VERIFICACIÓN] Permiso Screen Recording TCC concedido: \(hasPermissions)")

print("\n[SIMULACIÓN LAN] Iniciando simulación de captura supervisada...")
indicator.show(teacherName: "Mariana Fuentes")

do {
    try captureManager.startCapture(config: .thumbnail)
    let sdpOffer = webrtcEngine.createOffer(sessionId: "stream_mac_test_01", config: .thumbnail)
    print("[SIGNALING] SDP Offer generado para enviar al Gateway:\n\(sdpOffer)")
    
    // Simulate teacher sending Answer
    webrtcEngine.handleAnswer(sdpAnswer: "v=0\r\ns=TeacherAnswer...")
    
    // Immediate stop
    captureManager.stopCapture()
    webrtcEngine.close()
    indicator.hide()
    
    print("\n[ÉXITO] Ciclo de vida de captura y streaming en macOS validado.")
} catch {
    print("[ERROR] Fallo en la prueba de ScreenCaptureKit: \(error.localizedDescription)")
}
