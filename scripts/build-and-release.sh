#!/bin/bash
# =====================================================
# Focus Garden App 自动构建发布脚本
# 功能：拉取代码 → 构建 → 打包 APK → 发布到 GitHub Releases
# =====================================================

set -e  # 遇到错误立即退出

# ============== 配置区域 ==============
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/focus-garden-app}"
GITHUB_REPO="xiaoyujun/focus-garden-app"
BRANCH="${BRANCH:-main}"

# ============== 颜色输出 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============== 检查依赖 ==============
check_dependencies() {
    log_info "检查必要依赖..."
    
    local missing=()
    
    command -v git >/dev/null 2>&1 || missing+=("git")
    command -v node >/dev/null 2>&1 || missing+=("node")
    command -v npm >/dev/null 2>&1 || missing+=("npm")
    command -v gh >/dev/null 2>&1 || missing+=("gh (GitHub CLI)")
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "缺少以下依赖: ${missing[*]}"
        echo ""
        echo "安装指南:"
        echo "  Node.js: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
        echo "  GitHub CLI: curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install gh -y"
        exit 1
    fi
    
    # 检查 gh 登录状态
    if ! gh auth status >/dev/null 2>&1; then
        log_error "GitHub CLI 未登录，请先运行: gh auth login"
        exit 1
    fi
    
    log_info "依赖检查通过 ✓"
}

# ============== 拉取/克隆代码 ==============
fetch_code() {
    log_info "拉取最新代码..."
    
    if [ -d "$PROJECT_DIR" ]; then
        cd "$PROJECT_DIR"
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    else
        log_info "项目目录不存在，正在克隆..."
        git clone "https://github.com/${GITHUB_REPO}.git" "$PROJECT_DIR"
        cd "$PROJECT_DIR"
        git checkout "$BRANCH"
    fi
    
    log_info "代码拉取完成 ✓"
}

# ============== 获取版本号 ==============
get_version() {
    cd "$PROJECT_DIR"
    VERSION=$(node -p "require('./package.json').version")
    echo "$VERSION"
}

# ============== 构建项目 ==============
build_project() {
    log_info "安装依赖..."
    cd "$PROJECT_DIR"
    npm ci --prefer-offline || npm install
    
    log_info "构建 Web 资源..."
    npm run build
    
    log_info "构建完成 ✓"
}

# ============== 构建 APK ==============
build_apk() {
    log_info "同步 Capacitor 资源..."
    cd "$PROJECT_DIR"
    
    # 确保 android 目录存在
    if [ ! -d "android" ]; then
        log_info "初始化 Android 项目..."
        npx cap add android
    fi
    
    npx cap sync android
    
    log_info "构建 APK..."
    cd android
    
    # 使用 Gradle 构建 release APK
    if [ -f "gradlew" ]; then
        chmod +x gradlew
        ./gradlew assembleRelease --no-daemon
    else
        log_error "找不到 gradlew，请确保 Android 项目已正确初始化"
        exit 1
    fi
    
    # 查找生成的 APK
    APK_PATH=$(find . -name "*.apk" -path "*/release/*" | head -1)
    
    if [ -z "$APK_PATH" ]; then
        log_warn "未找到 release APK，尝试构建 debug 版本..."
        ./gradlew assembleDebug --no-daemon
        APK_PATH=$(find . -name "*.apk" -path "*/debug/*" | head -1)
    fi
    
    if [ -z "$APK_PATH" ]; then
        log_error "APK 构建失败，未找到 APK 文件"
        exit 1
    fi
    
    # 复制到项目根目录
    VERSION=$(get_version)
    FINAL_APK="$PROJECT_DIR/focus-garden-v${VERSION}.apk"
    cp "$APK_PATH" "$FINAL_APK"
    
    log_info "APK 构建完成: $FINAL_APK ✓"
    echo "$FINAL_APK"
}

# ============== 发布到 GitHub ==============
publish_release() {
    local apk_path="$1"
    local version=$(get_version)
    local tag="v${version}"
    local release_name="Focus Garden v${version}"
    
    cd "$PROJECT_DIR"
    
    log_info "准备发布 ${tag}..."
    
    # 生成发布说明
    RELEASE_NOTES="## Focus Garden v${version}

### 📱 安装说明
下载下方的 APK 文件，在 Android 设备上安装即可使用。

### 📋 更新内容
- 构建时间: $(date '+%Y-%m-%d %H:%M:%S')
- 构建分支: ${BRANCH}
- 构建提交: $(git rev-parse --short HEAD)

---
*此版本由自动构建脚本生成*"

    # 检查 tag 是否存在
    if git rev-parse "$tag" >/dev/null 2>&1; then
        log_warn "Tag ${tag} 已存在"
        
        # 检查 release 是否存在
        if gh release view "$tag" >/dev/null 2>&1; then
            read -p "Release ${tag} 已存在，是否覆盖? (y/N): " confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                log_info "删除旧 release..."
                gh release delete "$tag" --yes
                git tag -d "$tag" 2>/dev/null || true
                git push origin --delete "$tag" 2>/dev/null || true
            else
                log_info "取消发布"
                return 0
            fi
        fi
    fi
    
    # 创建 tag
    git tag -a "$tag" -m "Release ${tag}"
    git push origin "$tag"
    
    # 创建 release 并上传 APK
    log_info "创建 GitHub Release..."
    gh release create "$tag" \
        --title "$release_name" \
        --notes "$RELEASE_NOTES" \
        "$apk_path"
    
    log_info "🎉 发布成功！"
    log_info "Release URL: https://github.com/${GITHUB_REPO}/releases/tag/${tag}"
}

# ============== 仅构建 Web ==============
build_web_only() {
    check_dependencies
    fetch_code
    build_project
    
    VERSION=$(get_version)
    log_info "🎉 Web 构建完成！版本: v${VERSION}"
    log_info "输出目录: ${PROJECT_DIR}/dist"
}

# ============== 完整构建并发布 ==============
full_build_and_release() {
    check_dependencies
    fetch_code
    build_project
    
    APK_PATH=$(build_apk)
    publish_release "$APK_PATH"
}

# ============== 显示帮助 ==============
show_help() {
    echo "Focus Garden 构建发布脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  web       仅构建 Web 资源"
    echo "  apk       构建 APK (不发布)"
    echo "  release   完整构建并发布到 GitHub"
    echo "  help      显示此帮助"
    echo ""
    echo "环境变量:"
    echo "  PROJECT_DIR  项目目录 (默认: /home/ubuntu/focus-garden-app)"
    echo "  BRANCH       构建分支 (默认: main)"
    echo ""
    echo "示例:"
    echo "  $0 release                    # 完整构建并发布"
    echo "  BRANCH=dev $0 web             # 从 dev 分支构建 Web"
    echo "  PROJECT_DIR=/opt/app $0 apk   # 指定项目目录构建 APK"
}

# ============== 主入口 ==============
main() {
    case "${1:-help}" in
        web)
            build_web_only
            ;;
        apk)
            check_dependencies
            fetch_code
            build_project
            build_apk
            ;;
        release)
            full_build_and_release
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
