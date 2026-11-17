import XCTest
@testable import AssetSchoolAgent

/// R0 / S5: the teacher can only list, write and collect files inside the
/// school sandbox folder. Traversal, absolute paths, unsafe names and symbolic
/// links are rejected.
final class FileSandboxTests: XCTestCase {
    private var root: URL!
    private var outside: URL!
    private var service: FileManagerService!
    private let fm = FileManager.default

    override func setUpWithError() throws {
        let base = fm.temporaryDirectory.appendingPathComponent("assetschool-r0-\(UUID().uuidString)", isDirectory: true)
        root = base.appendingPathComponent("AssetSchool", isDirectory: true)
        outside = base.appendingPathComponent("outside", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        try fm.createDirectory(at: outside, withIntermediateDirectories: true)
        try "secreto".write(to: outside.appendingPathComponent("secret.txt"), atomically: true, encoding: .utf8)
        try "tarea".write(to: root.appendingPathComponent("tarea.txt"), atomically: true, encoding: .utf8)
        service = FileManagerService(sandboxRoot: root)
    }

    override func tearDownWithError() throws {
        try? fm.removeItem(at: root.deletingLastPathComponent())
    }

    private var b64: String { Data("hola".utf8).base64EncodedString() }

    // MARK: confine

    func testConfineAcceptsSandboxPaths() throws {
        let canonicalRoot = root.resolvingSymlinksInPath().path
        XCTAssertEqual(try service.confine(nil).path, canonicalRoot)
        XCTAssertTrue(try service.confine("tarea.txt").path.hasPrefix(canonicalRoot))
        XCTAssertTrue(try service.confine(root.appendingPathComponent("tarea.txt").path).path.hasPrefix(canonicalRoot))
    }

    func testConfineRejectsTraversalAbsoluteAndHomePaths() {
        for bad in ["../outside/secret.txt", "../../../../etc/passwd", "/etc/passwd", "/", "~/.ssh/id_rsa", "sub/../../outside"] {
            XCTAssertThrowsError(try service.confine(bad), "debería rechazar \(bad)")
        }
    }

    func testConfineRejectsSymlinkEscapingTheSandbox() throws {
        let link = root.appendingPathComponent("escape")
        try fm.createSymbolicLink(at: link, withDestinationURL: outside)
        XCTAssertThrowsError(try service.confine("escape/secret.txt"))
        XCTAssertThrowsError(try service.confine("escape"))
    }

    // MARK: file names

    func testValidateFileName() {
        for bad in ["", ".", "..", "../x.txt", "a/b.txt", "a\\b.txt", ".hidden"] {
            XCTAssertThrowsError(try service.validateFileName(bad), "debería rechazar '\(bad)'")
        }
        XCTAssertEqual(try service.validateFileName("guia.pdf"), "guia.pdf")
    }

    // MARK: write

    func testSaveIncomingFileRejectsTraversalInName() {
        let res = service.saveIncomingFile(fileName: "../outside/pwned.txt", base64Content: b64, targetDir: nil)
        XCTAssertFalse(res.success)
        XCTAssertFalse(fm.fileExists(atPath: outside.appendingPathComponent("pwned.txt").path))
    }

    func testSaveIncomingFileRejectsTargetDirOutsideSandbox() {
        let res = service.saveIncomingFile(fileName: "pwned.txt", base64Content: b64, targetDir: outside.path)
        XCTAssertFalse(res.success)
        XCTAssertFalse(fm.fileExists(atPath: outside.appendingPathComponent("pwned.txt").path))
    }

    func testSaveIncomingFileDoesNotFollowSymlinkDestination() throws {
        try fm.createSymbolicLink(at: root.appendingPathComponent("link.txt"), withDestinationURL: outside.appendingPathComponent("secret.txt"))
        let res = service.saveIncomingFile(fileName: "link.txt", base64Content: b64, targetDir: nil)
        XCTAssertFalse(res.success)
        XCTAssertEqual(try String(contentsOf: outside.appendingPathComponent("secret.txt"), encoding: .utf8), "secreto")
    }

    func testSaveIncomingFileWritesInsideSandbox() throws {
        let res = service.saveIncomingFile(fileName: "guia.pdf", base64Content: b64, targetDir: "Unidad1")
        XCTAssertTrue(res.success, res.error ?? "")
        let saved = try XCTUnwrap(res.savedPath)
        XCTAssertTrue(saved.hasPrefix(root.resolvingSymlinksInPath().path))
        XCTAssertEqual(try String(contentsOfFile: saved, encoding: .utf8), "hola")
    }

    // MARK: collect

    func testReadFileToCollectRejectsOutsidePaths() {
        XCTAssertFalse(service.readFileToCollect(path: "/etc/hosts").success)
        XCTAssertFalse(service.readFileToCollect(path: outside.appendingPathComponent("secret.txt").path).success)
        XCTAssertFalse(service.readFileToCollect(path: "../outside/secret.txt").success)
    }

    func testReadFileToCollectRejectsSymlinks() throws {
        try fm.createSymbolicLink(at: root.appendingPathComponent("link.txt"), withDestinationURL: outside.appendingPathComponent("secret.txt"))
        let res = service.readFileToCollect(path: root.appendingPathComponent("link.txt").path)
        XCTAssertFalse(res.success)
        XCTAssertNil(res.base64Content)
    }

    func testReadFileToCollectReadsSandboxFile() {
        let res = service.readFileToCollect(path: "tarea.txt")
        XCTAssertTrue(res.success, res.error ?? "")
        XCTAssertEqual(res.base64Content, Data("tarea".utf8).base64EncodedString())
    }

    // MARK: list

    func testListDirectoryOutsideSandboxReturnsNothing() {
        let res = service.listDirectory(path: "/")
        XCTAssertNotNil(res.error)
        XCTAssertTrue(res.items.isEmpty)
    }

    func testListDirectoryHidesSymlinksAndHasNoParentAtRoot() throws {
        try fm.createSymbolicLink(at: root.appendingPathComponent("escape"), withDestinationURL: outside)
        let res = service.listDirectory(path: nil)
        XCTAssertNil(res.error)
        XCTAssertNil(res.parentPath)
        let names = res.items.compactMap { $0["name"] as? String }
        XCTAssertTrue(names.contains("tarea.txt"))
        XCTAssertFalse(names.contains("escape"))
    }
}
