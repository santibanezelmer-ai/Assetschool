// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AssetSchoolAgent",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "AssetSchoolAgent", targets: ["AssetSchoolAgent"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "AssetSchoolAgent",
            dependencies: [],
            path: "Sources/AssetSchoolAgent"
        )
    ]
)
