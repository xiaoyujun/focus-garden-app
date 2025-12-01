#!/bin/bash
# =====================================================
# Focus Garden App WSL 构建脚本
# =====================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# 配置
BUILD_TYPE="debug"
CLEAN_BUILD=false
SKIP_NPM=false
SKIP_WEB=false
BUMP_VERSION=""
VERBOSE=false

# 获取脚本所在目录的父目录作为项目目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 环境变量
export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/android-sdk}
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# 显示帮助
show_help() {
    echo "Focus Garden APK 构建脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -d, --debug       构建 Debug 版本 (默认)"
    echo "  -r, --release     构建 Release 版本"
    echo "  -c, --clean       清理缓存后构建"
    echo "  -s, --skip-npm    跳过 npm install"
    echo "  -w, --skip-web    跳过前端构建"
    echo "  -b, --bump TYPE   升级版本号 (patch/minor/major)"
    echo "  -v, --verbose     显示详细日志"
    echo "  -h, --help        显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                 # 标准 Debug 构建"
    echo "  $0 -r              # 构建 Release 版本"
    echo "  $0 -c -b patch     # 清理后升级版本并构建"
    echo "  $0 -s -w           # 快速重建 (跳过依赖和前端)"
}

# 解析参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--debug) BUILD_TYPE="debug"; shift ;;
            -r|--release) BUILD_TYPE="release"; shift ;;
            -c|--clean) CLEAN_BUILD=true; shift ;;
            -s|--skip-npm) SKIP_NPM=true; shift ;;
            -w|--skip-web) SKIP_WEB=true; shift ;;
            -b|--bump) BUMP_VERSION="$2"; shift 2 ;;
            -v|--verbose) VERBOSE=true; shift ;;
            -h|--help) show_help; exit 0 ;;
            *) log_error "未知选项: $1"; show_help; exit 1 ;;
        esac
    done
}

# 检查环境
check_environment() {
    log_step "检查构建环境..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    log_info "Node.js: $(node -v)"
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi
    log_info "npm: $(npm -v)"
    
    # 检查 Java
    if ! command -v java &> /dev/null; then
        log_error "Java 未安装"
        exit 1
    fi
    log_info "Java: $(java -version 2>&1 | head -1)"
    
    # 检查 Android SDK
    if [ ! -d "$ANDROID_HOME" ]; then
        log_error "Android SDK 未找到: $ANDROID_HOME"
        exit 1
    fi
    log_info "Android SDK: $ANDROID_HOME"
    
    log_info "环境检查通过 ✓"
}

# 清理缓存
clean_cache() {
    if [ "$CLEAN_BUILD" = true ]; then
        log_step "清理构建缓存..."
        rm -rf "$PROJECT_DIR/dist"
        rm -rf "$PROJECT_DIR/android/app/build"
        rm -rf "$PROJECT_DIR/android/.gradle"
        log_info "缓存清理完成 ✓"
    fi
}

# 升级版本号
bump_version() {
    if [ -n "$BUMP_VERSION" ]; then
        log_step "升级版本号 ($BUMP_VERSION)..."
        cd "$PROJECT_DIR"
        npm version "$BUMP_VERSION" --no-git-tag-version
        NEW_VERSION=$(node -p "require('./package.json').version")
        log_info "新版本: $NEW_VERSION"
    fi
}

# 安装依赖
install_deps() {
    if [ "$SKIP_NPM" = false ]; then
        log_step "安装 npm 依赖..."
        cd "$PROJECT_DIR"
        npm install
        log_info "依赖安装完成 ✓"
    else
        log_info "跳过 npm install"
    fi
}

# 构建前端
build_web() {
    if [ "$SKIP_WEB" = false ]; then
        log_step "构建前端资源..."
        cd "$PROJECT_DIR"
        npm run build
        log_info "前端构建完成 ✓"
    else
        log_info "跳过前端构建"
    fi
}

# 初始化 Android 项目
init_android() {
    log_step "初始化 Android 项目..."
    cd "$PROJECT_DIR"
    
    if [ ! -d "android" ]; then
        log_info "首次添加 Android 平台..."
        npx cap add android
    fi
    
    log_info "同步 Capacitor..."
    npx cap sync android
    log_info "Android 同步完成 ✓"
}

# 构建 APK
build_apk() {
    log_step "构建 APK ($BUILD_TYPE)..."
    cd "$PROJECT_DIR/android"
    
    chmod +x gradlew
    
    if [ "$BUILD_TYPE" = "release" ]; then
        ./gradlew assembleRelease --no-daemon
        APK_PATH=$(find . -name "*.apk" -path "*/release/*" | head -1)
    else
        ./gradlew assembleDebug --no-daemon
        APK_PATH=$(find . -name "*.apk" -path "*/debug/*" | head -1)
    fi
    
    if [ -z "$APK_PATH" ]; then
        log_error "APK 构建失败，未找到 APK 文件"
        exit 1
    fi
    
    log_info "APK 构建完成 ✓"
}

# 导出 APK
export_apk() {
    log_step "导出 APK..."
    cd "$PROJECT_DIR"
    
    VERSION=$(node -p "require('./package.json').version")
    mkdir -p "$PROJECT_DIR/APK"
    
    if [ "$BUILD_TYPE" = "release" ]; then
        FINAL_APK="$PROJECT_DIR/APK/focus-garden-v${VERSION}-release.apk"
    else
        FINAL_APK="$PROJECT_DIR/APK/focus-garden-v${VERSION}.apk"
    fi
    
    cp "$PROJECT_DIR/android/$APK_PATH" "$FINAL_APK"
    
    log_info "=========================================="
    log_info "🎉 构建成功！"
    log_info "版本: v${VERSION}"
    log_info "类型: ${BUILD_TYPE}"
    log_info "APK: $FINAL_APK"
    log_info "=========================================="
}

# 主流程
main() {
    parse_args "$@"
    
    echo ""
    echo "=========================================="
    echo "  Focus Garden APK 构建"
    echo "=========================================="
    echo "项目目录: $PROJECT_DIR"
    echo "构建类型: $BUILD_TYPE"
    echo ""
    
    check_environment
    clean_cache
    bump_version
    install_deps
    build_web
    init_android
    build_apk
    export_apk
}

main "$@"
