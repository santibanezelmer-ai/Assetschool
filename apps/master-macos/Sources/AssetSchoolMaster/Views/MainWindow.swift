import SwiftUI
import AppKit

public struct MasterMainWindow: View {
    @ObservedObject var client = MasterGatewayClient.shared

    @State private var selectedDeviceForInspection: StudentDevice?
    @State private var deviceForDirectMessage: StudentDevice?
    @State private var deviceForDirectFile: StudentDevice?

    @State private var showMessageDialog = false
    @State private var showPowerDialog = false
    @State private var showFileDialog = false

    @State private var viewMode: MasterViewMode = .grid
    @State private var searchText: String = ""
    @State private var customIpAddress = "127.0.0.1"

    public init() {}

    public var filteredDevices: [StudentDevice] {
        if searchText.trimmingCharacters(in: .whitespaces).isEmpty {
            return client.devices
        }
        return client.devices.filter { dev in
            dev.hostname.localizedCaseInsensitiveContains(searchText) ||
            dev.localIp.localizedCaseInsensitiveContains(searchText) ||
            (dev.currentStudentName?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            // ==========================================
            // TOP VEYON-STYLE RIBBON / TOOLBAR
            // ==========================================
            HStack(spacing: 8) {
                // Group: Supervision
                RibbonButton(
                    title: "Monitor",
                    systemImage: "rectangle.grid.3x2.fill",
                    color: .blue,
                    isActive: true
                ) {
                    viewMode = .grid
                }

                Divider().frame(height: 38)

                // Group: Pedagogical Lock (Veyon Lock)
                RibbonButton(
                    title: "Bloquear Aula",
                    systemImage: "lock.fill",
                    color: .orange
                ) {
                    client.lockAll()
                }

                RibbonButton(
                    title: "Desbloquear",
                    systemImage: "lock.open.fill",
                    color: .green
                ) {
                    client.unlockAll()
                }

                Divider().frame(height: 38)

                // Group: Screen Broadcast (Veyon Presentation / Mediasoup SFU)
                RibbonButton(
                    title: client.isBroadcastingScreen ? "Detener" : "Transmitir",
                    systemImage: client.isBroadcastingScreen ? "stop.circle.fill" : "play.tv.fill",
                    color: client.isBroadcastingScreen ? .red : .purple,
                    isActive: client.isBroadcastingScreen
                ) {
                    if client.isBroadcastingScreen {
                        client.stopTeacherBroadcast()
                    } else {
                        client.startTeacherBroadcast()
                    }
                }

                Divider().frame(height: 38)

                // Group: Messaging
                RibbonButton(
                    title: "Mensaje",
                    systemImage: "message.fill",
                    color: .indigo
                ) {
                    deviceForDirectMessage = nil
                    showMessageDialog = true
                }

                // Group: File Transfer & Distribution
                RibbonButton(
                    title: "Archivos",
                    systemImage: "folder.badge.gearshape",
                    color: .teal
                ) {
                    deviceForDirectFile = nil
                    showFileDialog = true
                }

                // Group: Power Management (Reboot, Shutdown, Logout)
                RibbonButton(
                    title: "Energía",
                    systemImage: "power",
                    color: .red
                ) {
                    showPowerDialog = true
                }

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
                    Text("\(client.devices.count) equipos en \(client.activeClassroom.name)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Button(action: {
                    client.connect(host: customIpAddress, port: 3000)
                }) {
                    Image(systemName: "arrow.clockwise")
                        .padding(5)
                }
                .buttonStyle(BorderedButtonStyle())
                .help("Reconectar al servidor")
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
                        .fill(Color.white)
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle()
                                .stroke(Color.red, lineWidth: 2)
                                .scaleEffect(1.4)
                        )
                    Text("TRANSMITIENDO PANTALLA EN VIVO")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    Text("— Distribuyendo señal H.264 (Mediasoup SFU LAN) a \(client.devices.count) alumnos en \(client.activeClassroom.name)")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.92))
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
                .padding(.vertical, 7)
                .background(Color.red)
            }

            // ==========================================
            // CLASSROOM & FILTER CONTROL SUB-BAR
            // ==========================================
            HStack(spacing: 12) {
                // Classroom selector dropdown
                HStack(spacing: 6) {
                    Image(systemName: "building.2.crop.circle")
                        .foregroundColor(.secondary)
                    Picker("Aula:", selection: Binding(
                        get: { client.activeClassroom.id },
                        set: { newId in
                            if let found = client.availableClassrooms.first(where: { $0.id == newId }) {
                                client.switchClassroom(to: found)
                            }
                        }
                    )) {
                        ForEach(client.availableClassrooms) { room in
                            Text(room.name).tag(room.id)
                        }
                    }
                    .pickerStyle(MenuPickerStyle())
                    .frame(width: 170)
                }

                Divider().frame(height: 20)

                // Search box
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Filtrar por estudiante, equipo o IP...", text: $searchText)
                        .textFieldStyle(PlainTextFieldStyle())
                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(NSColor.textBackgroundColor))
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.gray.opacity(0.25), lineWidth: 1))
                .frame(maxWidth: 320)

                Divider().frame(height: 20)

                // Bulk selection helpers
                HStack(spacing: 6) {
                    Button("Todos") { client.selectAll() }
                        .buttonStyle(BorderedButtonStyle())
                        .controlSize(.small)
                    Button("Ninguno") { client.deselectAll() }
                        .buttonStyle(BorderedButtonStyle())
                        .controlSize(.small)

                    if !client.selectedDevices.isEmpty {
                        Text("\(client.selectedDevices.count) selecc.")
                            .font(.caption2)
                            .foregroundColor(.blue)
                            .fontWeight(.semibold)

                        Button(action: { client.lockSelected() }) {
                            Label("Bloquear", systemImage: "lock.fill")
                        }
                        .buttonStyle(BorderedButtonStyle())
                        .controlSize(.small)

                        Button(action: { client.unlockSelected() }) {
                            Label("Desbloquear", systemImage: "lock.open.fill")
                        }
                        .buttonStyle(BorderedButtonStyle())
                        .controlSize(.small)
                    }
                }

                Spacer()

                // View Mode Toggle (Grid vs List)
                Picker("", selection: $viewMode) {
                    ForEach(MasterViewMode.allCases) { mode in
                        Label(mode.rawValue, systemImage: mode.iconName).tag(mode)
                    }
                }
                .pickerStyle(SegmentedPickerStyle())
                .frame(width: 170)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(Color(NSColor.controlBackgroundColor))
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(Color.gray.opacity(0.15)),
                alignment: .bottom
            )

            // ==========================================
            // MAIN WORKSPACE: CLASSROOM GRID OR LIST
            // ==========================================
            if client.devices.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("No hay computadoras de estudiantes conectadas en \(client.activeClassroom.name)")
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text("Los agentes de Windows y macOS se anunciarán automáticamente por la red LAN (puerto UDP 48500).")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 420)

                    HStack(spacing: 8) {
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
            } else if viewMode == .grid {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 230, maximum: 310), spacing: 16)], spacing: 16) {
                        ForEach(filteredDevices) { device in
                            StudentTileView(
                                device: device,
                                onInspect: { selectedDeviceForInspection = device },
                                onMessage: {
                                    deviceForDirectMessage = device
                                    showMessageDialog = true
                                },
                                onSendFile: {
                                    deviceForDirectFile = device
                                    showFileDialog = true
                                }
                            )
                        }
                    }
                    .padding(16)
                }
                .background(Color(NSColor.controlBackgroundColor))
            } else {
                StudentTableView(
                    devices: filteredDevices,
                    onInspect: { dev in selectedDeviceForInspection = dev },
                    onMessage: { dev in
                        deviceForDirectMessage = dev
                        showMessageDialog = true
                    },
                    onSendFile: { dev in
                        deviceForDirectFile = dev
                        showFileDialog = true
                    }
                )
                .background(Color(NSColor.controlBackgroundColor))
            }

            // ==========================================
            // BOTTOM STATUS BAR
            // ==========================================
            HStack {
                Circle()
                    .fill(client.isConnected ? Color.green : Color.red)
                    .frame(width: 7, height: 7)

                Text(client.lastLog.isEmpty ? "AssetSchool Master listo para supervisión." : client.lastLog)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                Spacer()

                if let ack = client.lastMessageAck {
                    Text("✓ Aviso leído por \(ack.hostname)")
                        .font(.caption2)
                        .foregroundColor(.green)
                        .padding(.trailing, 8)
                }

                Text("AssetSchool Veyon Suite • LAN WebRTC SFU • Protocol v1.0")
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
        .frame(minWidth: 860, minHeight: 620)
        // Sheets
        .sheet(isPresented: $showMessageDialog) {
            MessageBroadcastSheet(
                isPresented: $showMessageDialog,
                targetDevice: deviceForDirectMessage
            )
        }
        .sheet(isPresented: $showFileDialog) {
            FileTransferSheet(
                isPresented: $showFileDialog,
                targetDevice: deviceForDirectFile
            )
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
// RIBBON BUTTON COMPONENT
// ==========================================
struct RibbonButton: View {
    let title: String
    let systemImage: String
    let color: Color
    var isActive: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: systemImage)
                    .font(.system(size: 18))
                    .foregroundColor(color)
                Text(title)
                    .font(.system(size: 10, weight: .medium))
                    .lineLimit(1)
            }
            .frame(width: 68, height: 46)
        }
        .buttonStyle(PlainButtonStyle())
        .background(isActive ? color.opacity(0.18) : Color.gray.opacity(0.08))
        .cornerRadius(6)
    }
}

// ==========================================
// STUDENT TILE COMPONENT (GRID VIEW)
// ==========================================
struct StudentTileView: View {
    @ObservedObject var device: StudentDevice
    var onInspect: () -> Void
    var onMessage: () -> Void
    var onSendFile: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Header: Selection Checkbox + Hostname + OS Icon + Status
            HStack(spacing: 6) {
                Button(action: { device.toggleSelected() }) {
                    Image(systemName: device.isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(device.isSelected ? .blue : .secondary)
                        .font(.system(size: 13))
                }
                .buttonStyle(PlainButtonStyle())

                Image(systemName: osIcon(device.osType))
                    .foregroundColor(.secondary)
                    .font(.system(size: 12))

                Text(device.hostname)
                    .font(.system(size: 11, weight: .bold))
                    .lineLimit(1)

                Spacer()

                if device.isLocked {
                    Image(systemName: "lock.fill")
                        .foregroundColor(.orange)
                        .font(.system(size: 11))
                }

                // Connection status dot
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color(NSColor.windowBackgroundColor))

            // Screen Frame / Live Thumbnail
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

                // Stale connection overlay
                if device.isDisconnected {
                    Color.black.opacity(0.75)
                    VStack(spacing: 4) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 24))
                            .foregroundColor(.gray)
                        Text("DESCONECTADO")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.gray)
                        Text(device.lastCommunicationFormatted)
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                    }
                } else if device.isConnectionStale {
                    VStack {
                        HStack {
                            Spacer()
                            Label("Sin respuesta reciente", systemImage: "exclamationmark.triangle.fill")
                                .font(.system(size: 9, weight: .semibold))
                                .padding(4)
                                .background(Color.yellow.opacity(0.9))
                                .foregroundColor(.black)
                                .cornerRadius(4)
                                .padding(6)
                        }
                        Spacer()
                    }
                }

                // Locked overlay
                if device.isLocked {
                    Color.black.opacity(0.65)
                    VStack(spacing: 4) {
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 26))
                            .foregroundColor(.orange)
                        Text("PAUSA PEDAGÓGICA")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.orange)
                    }
                }

                // Active teacher broadcast badge
                if MasterGatewayClient.shared.isBroadcastingScreen {
                    VStack {
                        Spacer()
                        HStack {
                            Label("Recibiendo Pantalla Docente", systemImage: "tv.fill")
                                .font(.system(size: 8, weight: .bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.purple.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(4)
                                .padding(4)
                            Spacer()
                        }
                    }
                }
            }
            .frame(height: 140)

            // Footer: Student Info and Quick Actions
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(device.currentStudentName ?? "Estudiante")
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        Text(device.localIp)
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                        Text("•")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                        Text(device.lastCommunicationFormatted)
                            .font(.system(size: 9))
                            .foregroundColor(device.isConnectionStale ? .orange : .secondary)
                    }
                }

                Spacer()

                // Actions: Inspect
                Button(action: onInspect) {
                    Image(systemName: "eye.fill")
                        .font(.system(size: 11))
                        .padding(4)
                }
                .buttonStyle(BorderedButtonStyle())
                .help("Inspeccionar / Control Remoto")

                // Actions: Lock / Unlock
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
                .help(device.isLocked ? "Desbloquear estación" : "Bloquear estación")

                // Actions: Message
                Button(action: onMessage) {
                    Image(systemName: "message")
                        .font(.system(size: 11))
                        .foregroundColor(.indigo)
                        .padding(4)
                }
                .buttonStyle(BorderedButtonStyle())
                .help("Enviar mensaje a este estudiante")

                // Actions: File Send
                Button(action: onSendFile) {
                    Image(systemName: "arrow.up.doc")
                        .font(.system(size: 11))
                        .foregroundColor(.teal)
                        .padding(4)
                }
                .buttonStyle(BorderedButtonStyle())
                .help("Enviar archivo a este estudiante")
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color(NSColor.windowBackgroundColor))
        }
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(borderStrokeColor, lineWidth: device.isSelected ? 2 : 1)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 3, x: 0, y: 1)
    }

    private var statusColor: Color {
        if device.isDisconnected { return .gray }
        if device.isConnectionStale { return .yellow }
        if device.isLocked { return .orange }
        return .green
    }

    private var borderStrokeColor: Color {
        if device.isSelected { return .blue }
        if device.isDisconnected { return .gray.opacity(0.3) }
        if device.isConnectionStale { return .yellow.opacity(0.7) }
        if device.isLocked { return .orange.opacity(0.6) }
        return .gray.opacity(0.2)
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
// STUDENT TABLE VIEW (LIST VIEW)
// ==========================================
struct StudentTableView: View {
    let devices: [StudentDevice]
    var onInspect: (StudentDevice) -> Void
    var onMessage: (StudentDevice) -> Void
    var onSendFile: (StudentDevice) -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Table Header
            HStack(spacing: 8) {
                Text("ESTADO").font(.caption2).fontWeight(.bold).frame(width: 70, alignment: .leading)
                Text("EQUIPO").font(.caption2).fontWeight(.bold).frame(width: 130, alignment: .leading)
                Text("ESTUDIANTE").font(.caption2).fontWeight(.bold).frame(width: 140, alignment: .leading)
                Text("IP").font(.caption2).fontWeight(.bold).frame(width: 110, alignment: .leading)
                Text("SISTEMA").font(.caption2).fontWeight(.bold).frame(width: 110, alignment: .leading)
                Text("ÚLTIMA SEÑAL").font(.caption2).fontWeight(.bold).frame(width: 100, alignment: .leading)
                Spacer()
                Text("ACCIONES").font(.caption2).fontWeight(.bold).frame(width: 140, alignment: .trailing)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(NSColor.windowBackgroundColor))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color.gray.opacity(0.2)), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(devices) { dev in
                        HStack(spacing: 8) {
                            // Checkbox + status dot
                            HStack(spacing: 6) {
                                Button(action: { dev.toggleSelected() }) {
                                    Image(systemName: dev.isSelected ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(dev.isSelected ? .blue : .secondary)
                                }
                                .buttonStyle(PlainButtonStyle())

                                Circle()
                                    .fill(dev.isDisconnected ? Color.gray : (dev.isConnectionStale ? Color.yellow : (dev.isLocked ? Color.orange : Color.green)))
                                    .frame(width: 7, height: 7)

                                Text(dev.isDisconnected ? "Off" : (dev.isLocked ? "Bloq" : "Online"))
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            .frame(width: 70, alignment: .leading)

                            Text(dev.hostname)
                                .font(.system(size: 12, weight: .bold))
                                .frame(width: 130, alignment: .leading)
                                .lineLimit(1)

                            Text(dev.currentStudentName ?? "Alumno")
                                .font(.system(size: 12))
                                .frame(width: 140, alignment: .leading)
                                .lineLimit(1)

                            Text(dev.localIp)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.secondary)
                                .frame(width: 110, alignment: .leading)

                            Text(dev.osNameFormatted)
                                .font(.caption2)
                                .foregroundColor(.secondary)
                                .frame(width: 110, alignment: .leading)

                            Text(dev.lastCommunicationFormatted)
                                .font(.caption2)
                                .foregroundColor(dev.isConnectionStale ? .orange : .secondary)
                                .frame(width: 100, alignment: .leading)

                            Spacer()

                            // Action buttons
                            HStack(spacing: 6) {
                                Button("Ver") { onInspect(dev) }
                                    .buttonStyle(BorderedButtonStyle())
                                    .controlSize(.small)

                                Button(action: {
                                    if dev.isLocked {
                                        MasterGatewayClient.shared.unlockDevice(id: dev.id)
                                    } else {
                                        MasterGatewayClient.shared.lockDevice(id: dev.id)
                                    }
                                }) {
                                    Image(systemName: dev.isLocked ? "lock.open.fill" : "lock.fill")
                                        .foregroundColor(dev.isLocked ? .green : .orange)
                                }
                                .buttonStyle(BorderedButtonStyle())
                                .controlSize(.small)

                                Button(action: { onMessage(dev) }) {
                                    Image(systemName: "message")
                                        .foregroundColor(.indigo)
                                }
                                .buttonStyle(BorderedButtonStyle())
                                .controlSize(.small)

                                Button(action: { onSendFile(dev) }) {
                                    Image(systemName: "arrow.up.doc")
                                        .foregroundColor(.teal)
                                }
                                .buttonStyle(BorderedButtonStyle())
                                .controlSize(.small)
                            }
                            .frame(width: 140, alignment: .trailing)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(dev.isSelected ? Color.blue.opacity(0.08) : Color.clear)
                        .overlay(Rectangle().frame(height: 1).foregroundColor(Color.gray.opacity(0.1)), alignment: .bottom)
                    }
                }
            }
        }
    }
}

// ==========================================
// MESSAGE BROADCAST SHEET
// ==========================================
struct MessageBroadcastSheet: View {
    @Binding var isPresented: Bool
    var targetDevice: StudentDevice? = nil

    @State private var title = "Aviso del Profesor"
    @State private var message = ""
    @State private var priority = "normal"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "message.fill")
                    .foregroundColor(.indigo)
                    .font(.title2)
                Text(targetDevice != nil ? "Enviar Mensaje a \(targetDevice!.hostname)" : "Enviar Mensaje a Toda el Aula")
                    .font(.headline)
            }

            if let target = targetDevice {
                Text("Destinatario: \(target.currentStudentName ?? "Estudiante") (\(target.localIp))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                Text("Destinatario: Todos los estudiantes de \(MasterGatewayClient.shared.activeClassroom.name)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

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

                Button("Enviar Mensaje") {
                    MasterGatewayClient.shared.sendPopupMessage(
                        title: title,
                        message: message,
                        targetDeviceId: targetDevice?.id,
                        priority: priority
                    )
                    isPresented = false
                }
                .buttonStyle(BorderedProminentButtonStyle())
                .disabled(message.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 460)
    }
}

// ==========================================
// FILE TRANSFER SHEET
// ==========================================
struct FileTransferSheet: View {
    @Binding var isPresented: Bool
    var targetDevice: StudentDevice? = nil

    @ObservedObject var client = MasterGatewayClient.shared
    @State private var selectedFileUrl: URL? = nil
    @State private var isSelectingFile = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "folder.badge.gearshape")
                    .foregroundColor(.teal)
                    .font(.title2)
                Text(targetDevice != nil ? "Distribuir Archivo a \(targetDevice!.hostname)" : "Distribuir Archivo a Toda el Aula")
                    .font(.headline)
            }

            Text("El archivo se transferirá a la carpeta de trabajo escolar (~/Downloads/AssetSchool) con verificación criptográfica SHA-256.")
                .font(.caption)
                .foregroundColor(.secondary)

            Divider()

            // File selection
            HStack {
                if let url = selectedFileUrl {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(url.lastPathComponent)
                            .font(.system(size: 12, weight: .bold))
                        Text(url.path)
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                } else {
                    Text("Ningún archivo seleccionado")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }

                Spacer()

                Button("Seleccionar Archivo...") {
                    selectFile()
                }
            }
            .padding(10)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(6)

            // Progress or status
            if let active = client.activeTransfer {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(active.status.rawValue)
                            .font(.caption)
                            .fontWeight(.semibold)
                        Spacer()
                        if !active.sha256.isEmpty {
                            Text("SHA-256: \(active.sha256.prefix(12))...")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(.secondary)
                        }
                    }

                    ProgressView(value: active.progress, total: 1.0)
                        .progressViewStyle(LinearProgressViewStyle())

                    if let err = active.errorMessage {
                        Text("Error: \(err)")
                            .font(.caption2)
                            .foregroundColor(.red)
                    }
                }
                .padding(10)
                .background(Color.blue.opacity(0.06))
                .cornerRadius(6)
            }

            HStack {
                Button("Cerrar") {
                    isPresented = false
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button("Distribuir Archivo") {
                    guard let url = selectedFileUrl else { return }
                    client.sendFile(
                        fileUrl: url,
                        toDeviceId: targetDevice?.id,
                        isBroadcast: targetDevice == nil
                    )
                }
                .buttonStyle(BorderedProminentButtonStyle())
                .disabled(selectedFileUrl == nil)
            }
        }
        .padding(20)
        .frame(width: 480)
    }

    private func selectFile() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            self.selectedFileUrl = url
        }
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
            HStack {
                Image(systemName: "power")
                    .foregroundColor(.red)
                    .font(.title2)
                Text("Administración de Energía del Aula")
                    .font(.headline)
            }

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
        .frame(width: 420)
    }
}

// ==========================================
// DEVICE INSPECTION & REMOTE CONTROL SHEET
// ==========================================
struct DeviceInspectionSheet: View {
    @ObservedObject var device: StudentDevice
    @Environment(\.dismiss) var dismiss

    @State private var remoteFiles: [RemoteFileItem] = []
    @State private var showWorkExplorer = false

    var body: some View {
        VStack(spacing: 0) {
            // Header Bar
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("Supervisión y Control Remoto:")
                            .font(.headline)
                        Text(device.hostname)
                            .font(.headline)
                            .fontWeight(.bold)
                    }
                    HStack(spacing: 8) {
                        Text(device.currentStudentName ?? "Alumno")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("•")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(device.localIp)
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("•")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(device.osNameFormatted)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                // Lock toggle button
                Button(action: {
                    if device.isLocked {
                        MasterGatewayClient.shared.unlockDevice(id: device.id)
                    } else {
                        MasterGatewayClient.shared.lockDevice(id: device.id)
                    }
                }) {
                    Label(device.isLocked ? "Desbloquear" : "Bloquear", systemImage: device.isLocked ? "lock.open.fill" : "lock.fill")
                        .foregroundColor(device.isLocked ? .green : .orange)
                }
                .buttonStyle(BorderedButtonStyle())

                Button("Cerrar") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
            }
            .padding(12)
            .background(Color(NSColor.windowBackgroundColor))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color.gray.opacity(0.2)), alignment: .bottom)

            // Screen Viewport with Mouse & Key Gestures
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

                    // Disconnection Warning Overlay
                    if device.isDisconnected {
                        Color.black.opacity(0.8)
                        VStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.yellow)
                            Text("Señal no disponible — Estación Desconectada")
                                .font(.headline)
                                .foregroundColor(.white)
                            Text("Última comunicación: \(device.lastCommunicationFormatted)")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .contentShape(Rectangle())
                // Left Click
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
                // Right Click via Context Menu
                .contextMenu {
                    Button("Clic Derecho Aquí") {
                        MasterGatewayClient.shared.sendRemoteInput(
                            deviceId: device.id,
                            type: "click",
                            x: 0.5,
                            y: 0.5,
                            button: "right"
                        )
                    }
                    Button("Doble Clic") {
                        MasterGatewayClient.shared.sendRemoteInput(
                            deviceId: device.id,
                            type: "doubleclick",
                            x: 0.5,
                            y: 0.5,
                            button: "left"
                        )
                    }
                    Divider()
                    Button("Explorar Carpeta de Trabajos") {
                        showWorkExplorer = true
                        MasterGatewayClient.shared.listRemoteDirectory(deviceId: device.id) { items in
                            self.remoteFiles = items
                        }
                    }
                }
            }
            .frame(minWidth: 760, minHeight: 480)

            // Footer Control Bar
            HStack(spacing: 12) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(device.isDisconnected ? Color.gray : Color.green)
                        .frame(width: 8, height: 8)
                    Text("Estado: \(device.lastCommunicationFormatted)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button(action: {
                    MasterGatewayClient.shared.powerAction(operation: "reboot", targetDeviceId: device.id)
                }) {
                    Label("Reiniciar", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(BorderedButtonStyle())
                .controlSize(.small)

                Button(action: {
                    MasterGatewayClient.shared.powerAction(operation: "shutdown", targetDeviceId: device.id)
                }) {
                    Label("Apagar", systemImage: "power")
                }
                .buttonStyle(BorderedButtonStyle())
                .controlSize(.small)

                Text("Haga clic para interactuar • Clic secundario para menú")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .padding(10)
            .background(Color(NSColor.windowBackgroundColor))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color.gray.opacity(0.2)), alignment: .top)
        }
        // Sheet for Remote Work Explorer
        .sheet(isPresented: $showWorkExplorer) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Carpeta Escolar Remota: \(device.hostname)")
                        .font(.headline)
                    Spacer()
                    Button("Cerrar") { showWorkExplorer = false }
                }

                if remoteFiles.isEmpty {
                    Text("No hay archivos en la carpeta escolar de este estudiante.")
                        .foregroundColor(.secondary)
                        .padding()
                } else {
                    List(remoteFiles) { file in
                        HStack {
                            Image(systemName: file.iconName)
                            Text(file.name)
                            Spacer()
                            Text(file.formattedSize).foregroundColor(.secondary).font(.caption)
                            Button("Recolectar") {
                                MasterGatewayClient.shared.collectFile(deviceId: device.id, filePath: file.path)
                            }
                            .buttonStyle(BorderedButtonStyle())
                            .controlSize(.small)
                        }
                    }
                    .frame(height: 250)
                }
            }
            .padding()
            .frame(width: 480)
        }
    }
}
