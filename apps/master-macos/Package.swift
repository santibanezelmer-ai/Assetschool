// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AssetSchoolMaster",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "AssetSchoolMaster", targets: ["AssetSchoolMaster"])
    ],
    dependencies: [
        .package(url: "https://github.com/stasel/WebRTC.git", exact: "135.0.0")
    ],
    targets: [
        .executableTarget(
            name: "AssetSchoolMaster",
            dependencies: [
                .product(name: "WebRTC", package: "WebRTC")
            ],
            path: "Sources/AssetSchoolMaster"
        )
    ]
)
