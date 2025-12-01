#!/bin/bash
#==============================================================================
# Focus Garden App - APK 构建脚本
# 
# 功能：在 WSL 环境下构建 Android APK
# 用法：./build.sh [选项]
#==============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置
PROJECT_DIR="/mnt/c/Users/31927/Desktop/我开发的移动应用/focus-garden-app"
JAVA_HOME_PATH="/usr/lib/jvm/java-21-openjdk-amd64"
ANDROID_SDK_PATH="$HOME/android-sdk"

# 默认参数
BUILD_TYPE="debug"
SKIP_NPM=false
SKIP_BUILD=false
CLEAN=false
BUMP_VERSION=""
VERBOSE=false

#==============================================================================
# 帮助信息
#==============================================================================
show_help() {
    echo -e "${CYAN}Focus Garden App - APK 构建脚本${NC}"
    echo ""
    echo "用法: ./build.sh [选项]"
    echo ""
    echo "选项:"
    echo "  -d, --debug         构建 Debug 版本 (默认)"
    echo "  -r, --release       构建 Release 版本 (需要签名配置)"
    echo "  -c, --clean         清理构建缓存后再构建"
    echo "  -s, --skip-npm      跳过 npm install"
    echo "  -w, --skip-web      跳过前端构建 (使用现有 dist)"
    echo "  -b, --bump <type>   自动升级版本号 (patch/minor/major)"
    echo "  -v, --verbose       显示详细输出"
    echo "  -h, --help          显示帮助信息"
    echo ""
    echo "示例:"
    echo "  ./build.sh                    # 构建 Debug APK"
    echo "  ./build.sh -r                 # 构建 Release APK"
    echo "  ./build.sh -c -d              # 清理后构建 Debug"
    echo "  ./build.sh -b patch           # 升级补丁版本后构建"
    echo "  ./build.sh -s -w              # 快速重建 (跳过依赖和前端)"
    echo ""
}

#==============================================================================
# 日志函数
#==============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

#==============================================================================
# 环境检查
#==============================================================================
check_environment() {
    log_step "检查环境"
    
    local errors=0
    
    # 检查 Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node -v)
        log_info "Node.js: $node_version"
    else
        log_error "Node.js 未安装"
        ((errors++))
    fi
    
    # 检查 npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm -v)
        log_info "npm: v$npm_version"
    else
        log_error "npm 未安装"
        ((errors++))
    fi
    
    # 检查 Java
    if [ -d "$JAVA_HOME_PATH" ]; then
        export JAVA_HOME="$JAVA_HOME_PATH"
        local java_version=$("$JAVA_HOME/bin/java" -version 2>&1 | head -n 1)
        log_info "Java: $java_version"
    else
        log_error "Java 未找到: $JAVA_HOME_PATH"
        ((errors++))
    fi
    
    # 检查 Android SDK
    if [ -d "$ANDROID_SDK_PATH" ]; then
        export ANDROID_HOME="$ANDROID_SDK_PATH"
        export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
        log_info "Android SDK: $ANDROID_HOME"
    else
        log_error "Android SDK 未找到: $ANDROID_SDK_PATH"
        ((errors++))
    fi
    
    # 检查项目目录
    if [ -d "$PROJECT_DIR" ]; then
        log_info "项目目录: $PROJECT_DIR"
    else
        log_error "项目目录不存在: $PROJECT_DIR"
        ((errors++))
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "环境检查失败，共 $errors 个错误"
        exit 1
    fi
    
    log_success "环境检查通过"
}

#==============================================================================
# 版本管理
#==============================================================================
get_version() {
    node -p "require('$PROJECT_DIR/package.json').version"
}

bump_version() {
    local bump_type=$1
    local current_version=$(get_version)
    
    IFS='.' read -r major minor patch <<< "$current_version"
    
    case $bump_type in
        major)
            ((major++))
            minor=0
            patch=0
            ;;
        minor)
            ((minor++))
            patch=0
            ;;
        patch)
            ((patch++))
            ;;
        *)
            log_error "无效的版本类型: $bump_type (可选: patch/minor/major)"
            exit 1
            ;;
    esac
    
    local new_version="$major.$minor.$patch"
    
    # 更新 package.json
    sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$PROJECT_DIR/package.json"
    
    log_info "版本升级: $current_version -> $new_version"
    echo "$new_version"
}

#==============================================================================
# 清理
#==============================================================================
clean_build() {
    log_step "清理构建缓存"
    
    cd "$PROJECT_DIR"
    
    # 清理前端构建
    if [ -d "dist" ]; then
        rm -rf dist
        log_info "已删除 dist/"
    fi
    
    # 清理 Android 构建
    if [ -d "android/app/build" ]; then
        rm -rf android/app/build
        log_info "已删除 android/app/build/"
    fi
    
    # 清理 Gradle 缓存
    if [ -d "android/.gradle" ]; then
        rm -rf android/.gradle
        log_info "已删除 android/.gradle/"
    fi
    
    log_success "清理完成"
}

#==============================================================================
# 安装依赖
#==============================================================================
install_dependencies() {
    log_step "安装 npm 依赖"
    
    cd "$PROJECT_DIR"
    npm install
    
    log_success "依赖安装完成"
}

#==============================================================================
# 构建前端
#==============================================================================
build_web() {
    log_step "构建前端资源"
    
    cd "$PROJECT_DIR"
    npm run build
    
    if [ -d "dist" ]; then
        local file_count=$(find dist -type f | wc -l)
        log_success "前端构建完成 ($file_count 个文件)"
    else
        log_error "前端构建失败：dist 目录不存在"
        exit 1
    fi
}

#==============================================================================
# 初始化 Android 项目
#==============================================================================
init_android() {
    log_step "初始化 Android 项目"
    
    cd "$PROJECT_DIR"
    
    if [ ! -d "android" ]; then
        log_info "添加 Android 平台..."
        npx cap add android
    else
        log_info "Android 平台已存在"
    fi
    
    log_success "Android 项目初始化完成"
}

#==============================================================================
# 同步 Capacitor
#==============================================================================
sync_capacitor() {
    log_step "同步 Capacitor"
    
    cd "$PROJECT_DIR"
    npx cap sync android
    
    log_success "Capacitor 同步完成"
}

#==============================================================================
# 构建 APK
#==============================================================================
build_apk() {
    local build_type=$1
    
    log_step "构建 APK ($build_type)"
    
    cd "$PROJECT_DIR/android"
    chmod +x gradlew
    
    local gradle_task=""
    local apk_subpath=""
    
    if [ "$build_type" = "release" ]; then
        gradle_task="assembleRelease"
        apk_subpath="app/build/outputs/apk/release"
    else
        gradle_task="assembleDebug"
        apk_subpath="app/build/outputs/apk/debug"
    fi
    
    log_info "执行 Gradle 任务: $gradle_task"
    
    if [ "$VERBOSE" = true ]; then
        ./gradlew $gradle_task --no-daemon
    else
        ./gradlew $gradle_task --no-daemon -q
    fi
    
    # 查找生成的 APK
    APK_RESULT=$(find "$apk_subpath" -name "*.apk" 2>/dev/null | head -1)
    
    if [ -z "$APK_RESULT" ]; then
        log_error "APK 文件未找到"
        exit 1
    fi
    
    log_success "APK 构建完成: $APK_RESULT"
}

#==============================================================================
# 复制 APK 到输出目录
#==============================================================================
copy_apk() {
    local apk_file=$1
    local version=$2
    local build_type=$3
    
    log_step "导出 APK"
    
    local output_dir="$PROJECT_DIR/APK"
    mkdir -p "$output_dir"
    
    local output_name="focus-garden-v${version}"
    if [ "$build_type" = "release" ]; then
        output_name="${output_name}-release.apk"
    else
        output_name="${output_name}.apk"
    fi
    
    local output_path="$output_dir/$output_name"
    
    cp "$PROJECT_DIR/android/$apk_file" "$output_path"
    
    # 获取文件大小
    local file_size=$(du -h "$output_path" | cut -f1)
    
    log_success "APK 已导出"
    echo ""
    echo -e "${GREEN}┌─────────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│              构建成功！                         │${NC}"
    echo -e "${GREEN}├─────────────────────────────────────────────────┤${NC}"
    echo -e "${GREEN}│${NC} 版本:   ${CYAN}$version${NC}"
    echo -e "${GREEN}│${NC} 类型:   ${CYAN}$build_type${NC}"
    echo -e "${GREEN}│${NC} 大小:   ${CYAN}$file_size${NC}"
    echo -e "${GREEN}│${NC} 路径:   ${CYAN}APK/$output_name${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────────────┘${NC}"
    echo ""
}

#==============================================================================
# 主流程
#==============================================================================
main() {
    local start_time=$(date +%s)
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       Focus Garden App - APK 构建工具             ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # 检查环境
    check_environment
    
    # 进入项目目录
    cd "$PROJECT_DIR"
    
    # 版本升级
    local version=""
    if [ -n "$BUMP_VERSION" ]; then
        version=$(bump_version "$BUMP_VERSION")
    else
        version=$(get_version)
    fi
    
    log_info "当前版本: $version"
    log_info "构建类型: $BUILD_TYPE"
    
    # 清理
    if [ "$CLEAN" = true ]; then
        clean_build
    fi
    
    # 安装依赖
    if [ "$SKIP_NPM" = false ]; then
        install_dependencies
    else
        log_warn "跳过 npm install"
    fi
    
    # 构建前端
    if [ "$SKIP_BUILD" = false ]; then
        build_web
    else
        log_warn "跳过前端构建"
    fi
    
    # 初始化 Android
    init_android
    
    # 同步 Capacitor
    sync_capacitor
    
    # 构建 APK
    build_apk "$BUILD_TYPE"
    
    # 复制到输出目录
    copy_apk "$APK_RESULT" "$version" "$BUILD_TYPE"
    
    # 计算耗时
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))
    
    echo -e "${BLUE}总耗时: ${minutes}分${seconds}秒${NC}"
    echo ""
}

#==============================================================================
# 解析命令行参数
#==============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--debug)
            BUILD_TYPE="debug"
            shift
            ;;
        -r|--release)
            BUILD_TYPE="release"
            shift
            ;;
        -c|--clean)
            CLEAN=true
            shift
            ;;
        -s|--skip-npm)
            SKIP_NPM=true
            shift
            ;;
        -w|--skip-web)
            SKIP_BUILD=true
            shift
            ;;
        -b|--bump)
            BUMP_VERSION="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 执行主流程
main
