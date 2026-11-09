import Foundation

print("==================================================")
print(" AssetSchool Native Agent — macOS (Swift)")
print(" Fase 01: Fundación de Arquitectura y Protocolo")
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

print("[INFO] Agente macOS preparado para integración con ScreenCaptureKit en fases siguientes.")
