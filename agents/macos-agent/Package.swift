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
    dependencies: [
        .package(url: "https://github.com/stasel/WebRTC.git", exact: "135.0.0")
    ],
    targets: [
        .executableTarget(
            name: "AssetSchoolAgent",
            dependencies: [
                .product(name: "WebRTC", package: "WebRTC")
            ],
            path: "Sources/AssetSchoolAgent"
        ),
        // R0 / S5: security tests for the file sandbox.
        .testTarget(
            name: "AssetSchoolAgentTests",
            dependencies: ["AssetSchoolAgent"],
            path: "Tests/AssetSchoolAgentTests"
        )
    ]
)
