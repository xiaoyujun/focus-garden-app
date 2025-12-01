# Focus Garden App - WSL 构建 APK 指南

本文档介绍如何使用 WSL (Windows Subsystem for Linux) 环境构建 Android APK。

---

## 一、环境要求

### 1.1 必需软件

| 软件 | 版本要求 | 检查命令 |
|------|----------|----------|
| WSL 2 | Ubuntu 20.04+ | `wsl --version` |
| Node.js | 18+ | `node -v` |
| npm | 8+ | `npm -v` |
| Java JDK | 21 | `java -version` |
| Android SDK | - | `echo $ANDROID_HOME` |

### 1.2 WSL 环境配置

如果尚未配置 WSL 环境，请按以下步骤操作：

```bash
# 1. 安装 Node.js (使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 2. 安装 Java 21
sudo apt update
sudo apt install openjdk-21-jdk -y

# 3. 安装 Android SDK
mkdir -p ~/android-sdk && cd ~/android-sdk
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip
mkdir -p cmdline-tools/latest
mv cmdline-tools/* cmdline-tools/latest/ 2>/dev/null || true

# 4. 配置环境变量 (添加到 ~/.bashrc)
echo 'export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64' >> ~/.bashrc
echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
echo 'export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH' >> ~/.bashrc
source ~/.bashrc

# 5. 安装 Android SDK 组件
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

---

## 二、构建脚本使用

### 2.1 脚本位置

```
scripts/build.sh
```

### 2.2 基本用法

在 Windows PowerShell 中运行：

```powershell
# 基本构建 (Debug 版本)
wsl bash "/mnt/c/Users/31927/Desktop/我开发的移动应用/focus-garden-app/scripts/build.sh"

# 或者进入 WSL 后运行
wsl
cd /mnt/c/Users/31927/Desktop/我开发的移动应用/focus-garden-app
./scripts/build.sh
```

### 2.3 命令行选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--debug` | `-d` | 构建 Debug 版本 (默认) |
| `--release` | `-r` | 构建 Release 版本 |
| `--clean` | `-c` | 清理缓存后构建 |
| `--skip-npm` | `-s` | 跳过 npm install |
| `--skip-web` | `-w` | 跳过前端构建 |
| `--bump <type>` | `-b` | 自动升级版本号 |
| `--verbose` | `-v` | 显示详细日志 |
| `--help` | `-h` | 显示帮助信息 |

### 2.4 使用示例

```bash
# 1. 标准构建 (Debug)
./scripts/build.sh

# 2. 构建 Release 版本
./scripts/build.sh -r

# 3. 清理后构建
./scripts/build.sh -c

# 4. 升级补丁版本后构建 (如 2.3.5 -> 2.3.6)
./scripts/build.sh -b patch

# 5. 升级次版本后构建 (如 2.3.5 -> 2.4.0)
./scripts/build.sh -b minor

# 6. 快速重建 (跳过依赖安装和前端构建)
./scripts/build.sh -s -w

# 7. 组合使用：清理 + 升级版本 + Release
./scripts/build.sh -c -b patch -r
```

---

## 三、构建流程说明

脚本执行以下步骤：

```
1. 环境检查
   ├── 检查 Node.js / npm
   ├── 检查 Java JDK
   ├── 检查 Android SDK
   └── 检查项目目录

2. 版本管理 (可选)
   └── 根据 --bump 参数升级版本号

3. 清理缓存 (可选)
   ├── 删除 dist/
   ├── 删除 android/app/build/
   └── 删除 android/.gradle/

4. 安装依赖
   └── npm install

5. 构建前端
   └── npm run build -> dist/

6. 初始化 Android
   └── npx cap add android (首次)

7. 同步 Capacitor
   └── npx cap sync android

8. 构建 APK
   ├── Debug: ./gradlew assembleDebug
   └── Release: ./gradlew assembleRelease

9. 导出 APK
   └── 复制到 APK/ 目录
```

---

## 四、输出文件

### 4.1 APK 位置

构建成功后，APK 文件保存在：

```
APK/focus-garden-v{版本号}.apk        # Debug 版本
APK/focus-garden-v{版本号}-release.apk  # Release 版本
```

### 4.2 Debug vs Release

| 特性 | Debug | Release |
|------|-------|---------|
| 签名 | 自动 (调试密钥) | 需要配置签名 |
| 体积 | 较大 | 较小 |
| 性能 | 包含调试信息 | 优化后 |
| 安装 | 可直接安装 | 需要有效签名 |
| 用途 | 开发测试 | 正式发布 |

**建议**：日常开发使用 Debug 版本，正式发布前配置签名后使用 Release 版本。

---

## 五、Release 签名配置

如需构建可发布的 Release APK，需要配置签名：

### 5.1 创建密钥库

```bash
keytool -genkey -v -keystore focus-garden.keystore \
  -alias focus-garden \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

### 5.2 配置签名

在 `android/app/build.gradle` 中添加：

```groovy
android {
    signingConfigs {
        release {
            storeFile file('path/to/focus-garden.keystore')
            storePassword 'your_store_password'
            keyAlias 'focus-garden'
            keyPassword 'your_key_password'
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            // ...
        }
    }
}
```

> **安全提示**：不要将密钥库和密码提交到版本控制！

---

## 六、常见问题

### Q1: 构建失败 - Java 版本错误

**错误信息**：`error: invalid source release: 21`

**解决方案**：
```bash
# 确保使用 Java 21
sudo apt install openjdk-21-jdk -y
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
```

### Q2: APK 无法安装

**可能原因**：
- 使用了未签名的 Release APK
- 手机未开启"允许安装未知来源应用"

**解决方案**：
- 使用 Debug 版本：`./scripts/build.sh -d`
- 或配置 Release 签名后重新构建

### Q3: Gradle 下载超时

**解决方案**：
```bash
# 使用国内镜像，编辑 android/gradle/wrapper/gradle-wrapper.properties
# 将 distributionUrl 改为阿里云镜像
distributionUrl=https://mirrors.aliyun.com/macports/distfiles/gradle/gradle-8.11.1-all.zip
```

### Q4: Android SDK 找不到

**解决方案**：
```bash
# 检查环境变量
echo $ANDROID_HOME

# 如果为空，手动设置
export ANDROID_HOME=$HOME/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
```

### Q5: 构建很慢

**优化建议**：
```bash
# 使用快速构建选项（跳过依赖和前端）
./scripts/build.sh -s -w

# 仅在代码变更时使用完整构建
./scripts/build.sh
```

---

## 七、快速参考

```bash
# 最常用命令
./scripts/build.sh              # 标准 Debug 构建
./scripts/build.sh -b patch     # 升级版本并构建
./scripts/build.sh -c           # 清理后构建
./scripts/build.sh -s -w        # 快速重建

# 查看帮助
./scripts/build.sh -h
```

---

## 八、相关文件

| 文件 | 说明 |
|------|------|
| `scripts/build.sh` | 主构建脚本 |
| `package.json` | 项目配置和版本号 |
| `capacitor.config.json` | Capacitor 配置 |
| `android/` | Android 原生项目 |
| `APK/` | 构建输出目录 |
