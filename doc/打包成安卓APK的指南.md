# Focus Garden App - 服务器打包APK指南

本指南介绍如何在Linux服务器上将Vue项目打包成Android APK。

---

## 一、服务器环境要求

### 1.1 必需软件

| 软件 | 最低版本 | 检查命令 |
|------|----------|----------|
| Node.js | 18+ | `node -v` |
| npm | 8+ | `npm -v` |
| Java JDK | 17+ | `java -version` |
| Git | 2.x | `git --version` |
| Android SDK | - | `echo $ANDROID_HOME` |

### 1.2 安装Android SDK（如未安装）

```bash
# 创建SDK目录
mkdir -p ~/android-sdk && cd ~/android-sdk

# 下载命令行工具
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip
mkdir -p cmdline-tools/latest
mv cmdline-tools/* cmdline-tools/latest/ 2>/dev/null || true

# 设置环境变量（添加到 ~/.bashrc）
export ANDROID_HOME=~/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# 接受许可并安装必要组件
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

---

## 二、打包步骤

### 2.1 克隆项目

```bash
cd ~
git clone https://github.com/xiaoyujun/focus-garden-app.git
cd focus-garden-app
```

### 2.2 安装依赖

```bash
npm install
```

### 2.3 构建前端

```bash
npm run build
```

构建成功后会生成 `dist/` 目录。

### 2.4 配置Capacitor

```bash
# 安装Capacitor（如果package.json中没有）
npm install @capacitor/core @capacitor/cli @capacitor/android --save

# 添加Android平台
npx cap add android

# 同步Web资源到Android项目
npx cap sync android
```

### 2.5 构建APK

```bash
# 设置环境变量
export ANDROID_HOME=~/android-sdk

# 进入android目录并构建
cd android
chmod +x gradlew
./gradlew assembleDebug
```

### 2.6 获取APK

构建成功后，APK文件位于：
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 三、发布到GitHub Releases

### 3.1 安装GitHub CLI

```bash
# 下载并安装
cd /tmp
curl -sLO https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz
tar xzf gh_2.62.0_linux_amd64.tar.gz
sudo cp gh_2.62.0_linux_amd64/bin/gh /usr/local/bin/
```

### 3.2 认证GitHub

1. 在GitHub创建Personal Access Token：https://github.com/settings/tokens/new
   - 勾选 `repo` 权限
2. 使用Token登录：
```bash
echo "你的token" | gh auth login --with-token
```

### 3.3 创建Release

```bash
cd ~/focus-garden-app

# 复制并重命名APK
cp android/app/build/outputs/apk/debug/app-debug.apk ./focus-garden-v1.0.0.apk

# 创建release并上传
gh release create v1.0.0 ./focus-garden-v1.0.0.apk \
  --title "Focus Garden v1.0.0" \
  --notes "首个发布版本"
```

---

## 四、常见问题

### Q1: Gradle下载超时
**原因**: 国内网络访问Gradle官网慢

**解决**: 如果已有Gradle缓存，可以复制到新目录：
```bash
cp -r ~/.gradle/wrapper/dists/gradle-8.x-all/已有目录/* ~/.gradle/wrapper/dists/gradle-8.x-all/新目录/
```

### Q2: 找不到Android SDK
**解决**: 确保设置了环境变量：
```bash
export ANDROID_HOME=~/android-sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Q3: Java版本不兼容
**解决**: 安装JDK 17或21：
```bash
sudo apt install openjdk-21-jdk -y
```

---

## 五、一键打包脚本

将以下内容保存为 `build-apk.sh`：

```bash
#!/bin/bash
set -e

echo "=== 1. 安装依赖 ==="
npm install

echo "=== 2. 构建前端 ==="
npm run build

echo "=== 3. 同步Capacitor ==="
npx cap sync android

echo "=== 4. 构建APK ==="
export ANDROID_HOME=~/android-sdk
cd android && ./gradlew assembleDebug

echo "=== 完成 ==="
echo "APK位置: android/app/build/outputs/apk/debug/app-debug.apk"
```

运行：
```bash
chmod +x build-apk.sh
./build-apk.sh
```

---

## 六、相关链接

- **GitHub仓库**: https://github.com/xiaoyujun/focus-garden-app
- **最新Release**: https://github.com/xiaoyujun/focus-garden-app/releases
- **Capacitor文档**: https://capacitorjs.com/docs