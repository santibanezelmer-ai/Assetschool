import SwiftUI
import AppKit

public struct MasterMainWindow: View {
    @ObservedObject var client = MasterGatewayClient.shared
    @State private var selectedDeviceForInspection: StudentDevice?
    @State private var showMessageDialog = false
    @State private var showPowerDialog = false
    @State private var messageText = "Por favor guarden silencio y presten atención."
    @State private var messageTitle = "Aviso del Profesor"
    @State private var selectedPowerAction = "reboot"
    @State private var customIpAddress = "127.0.0.1"

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // ==========================================
            // TOP VEYON-STYLE RIBBON / TOOLBAR
            // ==========================================
            HStack(spacing: 12) {
                // Group: Supervision
                VStack(spacing: 4) {
                    Image(systemName: "rectangle.grid.3x2.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.blue)
                    Text("Monitor")
                        .font(.caption2)
                        .fontWeight(.medium)
                }
                .frame(width: 58, height: 50)
                .background(Color.blue.opacity(0.12))
                .cornerRadius(8)

                Divider().frame(height: 40)

                // Group: Pedagogical Lock (Veyon Lock)
                Button(action: {
                    client.lockAll()
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.orange)
                        Text("Bloquear")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .frame(width: 64, height: 50)
                }
                .buttonStyle(PlainButtonStyle())
                .background(Color.orange.opacity(0.12))
                .cornerRadius(8)

                Button(action: {
                    client.unlockAll()
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "lock.open.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.green)
                        Text("Desbloquear")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .frame(width: 74, height: 50)
                }
                .buttonStyle(PlainButtonStyle())
                .background(Color.green.opacity(0.12))
                .cornerRadius(8)

                Divider().frame(height: 40)

                // Group: Screen Broadcast (Veyon Presentation)
                Button(action: {
                    if client.isBroadcastingScreen {
                        client.stopTeacherBroadcast()
                    } else {
                        client.startTeacherBroadcast()
                    }
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: client.isBroadcastingScreen ? "stop.circle.fill" : "play.tv.fill")
                            .font(.system(size: 20))
                            .foregroundColor(client.isBroadcastingScreen ? .red : .purple)
                        Text(client.isBroadcastingScreen ? "Detener" : "Transmitir")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .frame(width: 68, height: 50)
                }
                .buttonStyle(PlainButtonStyle())
                .background(client.isBroadcastingScreen ? Color.red.opacity(0.12) : Color.purple.opacity(0.12))
                .cornerRadius(8)

                // Group: Messaging
                Button(action: {
                    showMessageDialog = true
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "message.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.indigo)
                        Text("Mensaje")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .frame(width: 58, height: 50)
                }
                .buttonStyle(PlainButtonStyle())
                .background(Color.indigo.opacity(0.12))
                .cornerRadius(8)

                // Group: Power Management (Reboot, Shutdown, Logout)
                Button(action: {
                    showPowerDialog = true
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "power")
                            .font(.system(size: 20))
                            .foregroundColor(.red)
                        Text("Energía")
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .frame(width: 58, height: 50)
                }
                .buttonStyle(PlainButtonStyle())
                .background(Color.red.opacity(0.12))
                .cornerRadius(8)

                Spacer()

                // Connection info & status pill
                VStack(alignment: .trailing, spacing: 2) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(client.isConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(client.isConnected ? "Conectado (:3000)" : "Desconectado")
                            .font(.caption)
                            .fontWeight(.semibold)
                    }
                    Text("\(client.devices.count) alumnos detectados")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Button(action: {
                    client.connect(host: customIpAddress, port: 3000)
                }) {
                    Image(systemName: "arrow.clockwise")
                        .padding(6)
                }
                .buttonStyle(BorderedButtonStyle())
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(NSColor.windowBackgroundColor))
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(Color.gray.opacity(0.2)),
                alignment: .bottom
            )

            // ==========================================
            // LIVE TEACHER BROADCAST BANNER
            // ==========================================
            if client.isBroadcastingScreen {
                HStack(spacing: 12) {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 10, height: 10)
                    Text("TRANSMITIENDO PANTALLA EN VIVO")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    Text("— Distribuyendo señal H.264 (Mediasoup SFU) a \(client.devices.count) estudiantes")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.9))
                    Spacer()
                    Button("Detener Transmisión") {
                        client.stopTeacherBroadcast()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.white)
                    .foregroundColor(.red)
                    .controlSize(.small)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.red)
            }

            // ==========================================
            // MAIN WORKSPACE: CLASSROOM GRID
            // ==========================================
            if client.devices.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("No hay computadoras de estudiantes conectadas")
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text("Los agentes de Windows y macOS se anunciarán automáticamente por la red LAN (puerto UDP 48500).")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 400)
                    HStack {
                        TextField("IP del Servidor", text: $customIpAddress)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .frame(width: 140)
                        Button("Reconectar") {
                            client.connect(host: customIpAddress, port: 3000)
                        }
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(NSColor.controlBackgroundColor))
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 220, maximum: 300), spacing: 16)], spacing: 16) {
                        ForEach(client.devices) { device in
                            StudentTileView(device: device) {
                                selectedDeviceForInspection = device
                            }
                        }
                    }
                    .padding(16)
                }
                .background(Color(NSColor.controlBackgroundColor))
            }

            // ==========================================
            // BOTTOM STATUS BAR
            // ==========================================
            HStack {
                Text(client.lastLog.isEmpty ? "AssetSchool Master listo para supervisión." : client.lastLog)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Spacer()
                Text("Veyon Functional Parity Suite • Protocol v1.0")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(Color(NSColor.windowBackgroundColor))
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(Color.gray.opacity(0.2)),
                alignment: .top
            )
        }
        .frame(minWidth: 800, minHeight: 600)
        // Dialogs
        .sheet(isPresented: $showMessageDialog) {
            MessageBroadcastSheet(isPresented: $showMessageDialog)
        }
        .sheet(isPresented: $showPowerDialog) {
            PowerManagementSheet(isPresented: $showPowerDialog)
        }
        .sheet(item: $selectedDeviceForInspection) { device in
            DeviceInspectionSheet(device: device)
        }
        .onAppear {
            client.connect()
        }
    }
}

// ==========================================
// STUDENT TILE COMPONENT
// ==========================================
struct StudentTileView: View {
    @ObservedObject var device: StudentDevice
    var onInspect: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Header: Hostname + OS Icon + Lock indicator
            HStack {
                HStack(spacing: 4) {
                    Image(systemName: osIcon(device.osType))
                        .foregroundColor(.secondary)
                    Text(device.hostname)
                        .font(.caption)
                        .fontWeight(.bold)
                        .lineLimit(1)
                }

                Spacer()

                if device.isLocked {
                    Image(systemName: "lock.fill")
                        .foregroundColor(.orange)
                        .font(.caption2)
                }

                Circle()
                    .fill(device.status == .online ? Color.green : (device.status == .locked ? Color.orange : Color.gray))
                    .frame(width: 8, height: 8)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color(NSColor.windowBackgroundColor))

            // Screen Frame / Thumbnail
            ZStack {
                Color.black

                if let thumb = device.thumbnail {
                    Image(nsImage: thumb)
                        .resizable()
                        .scaledToFit()
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "display")
                            .font(.system(size: 32))
                            .foregroundColor(.gray)
                        Text(device.localIp)
                            .font(.system(size: 10))
                            .foregroundColor(.gray)
                    }
                }

                // If locked, overlay lock banner
                if device.isLocked {
                    Color.black.opacity(0.65)
                    VStack(spacing: 4) {
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.orange)
                        Text("BLOQUEADO")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.orange)
                    }
                }
            }
            .frame(height: 140)

            // Footer: Student info and action buttons
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(device.currentStudentName ?? "Alumno")
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                    Text(device.localIp)
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button(action: onInspect) {
                    Image(systemName: "eye.fill")
                        .font(.system(size: 11))
                        .padding(4)
                }
                .buttonStyle(BorderedButtonStyle())
                .help("Inspeccionar / Control Remoto")

                Button(action: {
                    if device.isLocked {
                        MasterGatewayClient.shared.unlockDevice(id: device.id)
                    } else {
                        MasterGatewayClient.shared.lockDevice(id: device.id)
                    }
                }) {
                    Image(systemName: device.isLocked ? "lock.open.fill" : "lock.fill")
                        .font(.system(size: 11))
                        .foregroundColor(device.isLocked ? .green : .orange)
                        .padding(4)
                }
                .buttonStyle(BorderedButtonStyle())
                .help(device.isLocked ? "Desbloquear" : "Bloquear")
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color(NSColor.windowBackgroundColor))
        }
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(device.isLocked ? Color.orange.opacity(0.6) : Color.gray.opacity(0.25), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 3, x: 0, y: 1)
    }

    private func osIcon(_ platform: MasterDevicePlatform) -> String {
        switch platform {
        case .windows: return "desktopcomputer"
        case .macos: return "apple.logo"
        case .linux: return "terminal.fill"
        case .chromeos: return "globe"
        default: return "laptopcomputer"
        }
    }
}

// ==========================================
// MESSAGE BROADCAST SHEET
// ==========================================
struct MessageBroadcastSheet: View {
    @Binding var isPresented: Bool
    @State private var title = "Aviso del Profesor"
    @State private var message = ""
    @State private var priority = "normal"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Enviar Mensaje a Estudiantes")
                .font(.headline)

            TextField("Título del Aviso", text: $title)
                .textFieldStyle(RoundedBorderTextFieldStyle())

            TextEditor(text: $message)
                .frame(height: 100)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.gray.opacity(0.3), lineWidth: 1))

            Picker("Prioridad", selection: $priority) {
                Text("Normal").tag("normal")
                Text("Urgente").tag("urgent")
                Text("Anuncio General").tag("announcement")
            }
            .pickerStyle(SegmentedPickerStyle())

            HStack {
                Button("Cancelar") {
                    isPresented = false
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button("Enviar a toda el aula") {
                    MasterGatewayClient.shared.sendPopupMessage(title: title, message: message, priority: priority)
                    isPresented = false
                }
                .buttonStyle(BorderedProminentButtonStyle())
                .disabled(message.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}

// ==========================================
// POWER MANAGEMENT SHEET
// ==========================================
struct PowerManagementSheet: View {
    @Binding var isPresented: Bool
    @State private var operation = "reboot"
    @State private var delaySeconds = 5

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Administración de Energía de Estaciones")
                .font(.headline)

            Picker("Acción", selection: $operation) {
                Text("Reiniciar Equipos").tag("reboot")
                Text("Apagar Equipos").tag("shutdown")
                Text("Cerrar Sesión").tag("logout")
            }
            .pickerStyle(RadioGroupPickerStyle())

            Stepper("Retardo de ejecución: \(delaySeconds) seg.", value: $delaySeconds, in: 0...60)

            HStack {
                Button("Cancelar") {
                    isPresented = false
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button("Ejecutar en toda el aula") {
                    MasterGatewayClient.shared.powerAction(operation: operation, delaySeconds: delaySeconds)
                    isPresented = false
                }
                .buttonStyle(BorderedProminentButtonStyle())
            }
        }
        .padding(20)
        .frame(width: 400)
    }
}

// ==========================================
// DEVICE INSPECTION & REMOTE CONTROL SHEET
// ==========================================
struct DeviceInspectionSheet: View {
    @ObservedObject var device: StudentDevice
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Control e Inspección: \(device.hostname) (\(device.localIp))")
                    .font(.headline)
                Spacer()
                Button("Cerrar") {
                    dismiss()
                }
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))

            GeometryReader { geo in
                ZStack {
                    Color.black

                    if let thumb = device.thumbnail {
                        Image(nsImage: thumb)
                            .resizable()
                            .scaledToFit()
                    } else {
                        VStack(spacing: 8) {
                            ProgressView()
                            Text("Recibiendo señal de video en vivo de \(device.hostname)...")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onEnded { value in
                            let normX = max(0.0, min(1.0, Double(value.location.x / geo.size.width)))
                            let normY = max(0.0, min(1.0, Double(value.location.y / geo.size.height)))
                            MasterGatewayClient.shared.sendRemoteInput(
                                deviceId: device.id,
                                type: "click",
                                x: normX,
                                y: normY,
                                button: "left"
                            )
                        }
                )
            }
            .frame(minWidth: 700, minHeight: 450)

            HStack(spacing: 12) {
                Button(action: {
                    if device.isLocked {
                        MasterGatewayClient.shared.unlockDevice(id: device.id)
                    } else {
                        MasterGatewayClient.shared.lockDevice(id: device.id)
                    }
                }) {
                    Label(device.isLocked ? "Desbloquear" : "Bloquear", systemImage: device.isLocked ? "lock.open.fill" : "lock.fill")
                }

                Button(action: {
                    MasterGatewayClient.shared.powerAction(operation: "reboot", targetDeviceId: device.id)
                }) {
                    Label("Reiniciar", systemImage: "arrow.counterclockwise")
                }

                Button(action: {
                    MasterGatewayClient.shared.powerAction(operation: "shutdown", targetDeviceId: device.id)
                }) {
                    Label("Apagar", systemImage: "power")
                }

                Spacer()

                Text("Haga clic sobre la pantalla para inyectar ratón y teclado")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(Color(NSColor.windowBackgroundColor))
        }
    }
}
