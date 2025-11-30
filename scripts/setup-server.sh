#!/bin/bash
# =====================================================
# 腾讯云服务器环境初始化脚本
# 安装 Node.js、GitHub CLI、Java (用于 Gradle)
# =====================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查是否为 root 或有 sudo 权限
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        if ! command -v sudo >/dev/null 2>&1; then
            log_error "需要 root 权限或 sudo"
            exit 1
        fi
        SUDO="sudo"
    else
        SUDO=""
    fi
}

# 安装 Node.js 20.x
install_nodejs() {
    if command -v node >/dev/null 2>&1; then
        local version=$(node -v)
        log_info "Node.js 已安装: $version"
        return 0
    fi
    
    log_info "安装 Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
    log_info "Node.js 安装完成: $(node -v)"
}

# 安装 GitHub CLI
install_gh() {
    if command -v gh >/dev/null 2>&1; then
        log_info "GitHub CLI 已安装: $(gh --version | head -1)"
        return 0
    fi
    
    log_info "安装 GitHub CLI..."
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | $SUDO dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    $SUDO chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | $SUDO tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    $SUDO apt-get update
    $SUDO apt-get install -y gh
    log_info "GitHub CLI 安装完成"
}

# 安装 Java (构建 APK 需要)
install_java() {
    if command -v java >/dev/null 2>&1; then
        log_info "Java 已安装: $(java -version 2>&1 | head -1)"
        return 0
    fi
    
    log_info "安装 OpenJDK 17..."
    $SUDO apt-get install -y openjdk-17-jdk
    
    # 设置 JAVA_HOME
    JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
    echo "export JAVA_HOME=$JAVA_HOME" >> ~/.bashrc
    export JAVA_HOME
    
    log_info "Java 安装完成"
}

# 安装 Android SDK (可选，用于签名 APK)
install_android_sdk() {
    if [ -d "$HOME/android-sdk" ] || [ -n "$ANDROID_HOME" ]; then
        log_info "Android SDK 已配置"
        return 0
    fi
    
    log_info "安装 Android 命令行工具..."
    
    # 创建 SDK 目录
    mkdir -p ~/android-sdk/cmdline-tools
    cd ~/android-sdk/cmdline-tools
    
    # 下载最新的命令行工具
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdline-tools.zip
    unzip -q cmdline-tools.zip
    mv cmdline-tools latest
    rm cmdline-tools.zip
    
    # 设置环境变量
    echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
    echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
    
    export ANDROID_HOME=$HOME/android-sdk
    export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
    
    # 接受许可证并安装基本组件
    yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses 2>/dev/null || true
    $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
    
    log_info "Android SDK 安装完成"
}

# 克隆项目
clone_project() {
    local project_dir="${1:-/home/ubuntu/focus-garden-app}"
    
    if [ -d "$project_dir" ]; then
        log_info "项目目录已存在: $project_dir"
        return 0
    fi
    
    log_info "克隆项目到 $project_dir..."
    git clone https://github.com/xiaoyujun/focus-garden-app.git "$project_dir"
    log_info "项目克隆完成"
}

# 配置 GitHub CLI
setup_gh_auth() {
    if gh auth status >/dev/null 2>&1; then
        log_info "GitHub CLI 已登录"
        return 0
    fi
    
    log_warn "GitHub CLI 未登录"
    echo ""
    echo "请运行以下命令进行登录:"
    echo "  gh auth login"
    echo ""
    echo "登录时选择:"
    echo "  - GitHub.com"
    echo "  - HTTPS"
    echo "  - 使用浏览器登录 或 粘贴 Personal Access Token"
    echo ""
    echo "如果使用 Token，需要在 GitHub 设置中创建:"
    echo "  https://github.com/settings/tokens/new"
    echo "  勾选 repo 权限"
    echo ""
}

# 主流程
main() {
    log_info "=== 腾讯云服务器环境初始化 ==="
    echo ""
    
    check_sudo
    
    log_info "更新软件包列表..."
    $SUDO apt-get update -qq
    
    # 安装基础工具
    log_info "安装基础工具..."
    $SUDO apt-get install -y git curl wget unzip
    
    install_nodejs
    install_gh
    install_java
    
    # 可选：安装 Android SDK (需要较多时间和空间)
    read -p "是否安装 Android SDK? (用于构建 APK，约需 1GB 空间) (y/N): " install_sdk
    if [[ "$install_sdk" =~ ^[Yy]$ ]]; then
        install_android_sdk
    fi
    
    # 克隆项目
    read -p "项目目录 (默认 /home/$USER/focus-garden-app): " project_dir
    project_dir="${project_dir:-/home/$USER/focus-garden-app}"
    clone_project "$project_dir"
    
    # 复制构建脚本
    if [ -f "$(dirname "$0")/build-and-release.sh" ]; then
        cp "$(dirname "$0")/build-and-release.sh" "$project_dir/"
        chmod +x "$project_dir/build-and-release.sh"
    fi
    
    echo ""
    log_info "=== 环境安装完成 ==="
    echo ""
    setup_gh_auth
    
    echo "后续步骤:"
    echo "  1. 运行 'gh auth login' 登录 GitHub"
    echo "  2. 运行 'source ~/.bashrc' 加载环境变量"
    echo "  3. 进入项目目录: cd $project_dir"
    echo "  4. 执行构建: ./build-and-release.sh release"
    echo ""
}

main "$@"
