// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "FnKeyHostPackage",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .executable(name: "fnkey-host", targets: ["FnKeyHost"]) 
    ],
    targets: [
        .executableTarget(
            name: "FnKeyHost",
            dependencies: [],
            path: "Sources"
        )
    ]
)


