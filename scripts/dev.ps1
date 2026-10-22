param([switch]$Seed, [int]$Port = 8080, [string]$MsysRoot = 'C:\msys64\ucrt64')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
    if (-not (Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' } }
    npm run build
    if ($LASTEXITCODE) { throw 'Frontend build failed' }
    if (Test-Path "$MsysRoot\bin\g++.exe") {
        $env:PATH = "$MsysRoot\bin;" + $env:PATH
        $taskCompiler = "$MsysRoot/bin/g++.exe"
        $taskMake = "$MsysRoot/bin/mingw32-make.exe"
        cmake -S . -B build -G 'MinGW Makefiles' "-DCMAKE_MAKE_PROGRAM=$taskMake" "-DCMAKE_CXX_COMPILER=$taskCompiler" "-DOPENSSL_ROOT_DIR=$MsysRoot" "-DSQLite3_INCLUDE_DIR=$MsysRoot/include" "-DSQLite3_LIBRARY=$MsysRoot/lib/libsqlite3.dll.a" -DCMAKE_BUILD_TYPE=Debug
    } else {
        cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
    }
    if ($LASTEXITCODE) { throw 'CMake configure failed. See README for dependencies.' }
    cmake --build build -j2
    if ($LASTEXITCODE) { throw 'C++ build failed' }
    $env:APP_ENV = 'development'
    $env:APP_URL = "http://localhost:$Port"
    $env:PORT = "$Port"
    $env:DATABASE_URL = ''
    if ($Seed) {
        $env:SEED_DEMO = 'true'
        if (-not $env:DEMO_PASSWORD) { $env:DEMO_PASSWORD = 'DemoShoppe123!' }
        Write-Host 'Development accounts: buyer@shoppe.local / seller@shoppe.local / seller2@shoppe.local / admin@shoppe.local'
        Write-Host 'Default development password: DemoShoppe123! (or your DEMO_PASSWORD on first seed).'
    }
    Write-Host "Open http://localhost:$Port"
    & '.\build\shoppe.exe'
} finally { Pop-Location }
