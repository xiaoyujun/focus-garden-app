# 打包 Android APK 指南

## 前提条件

1. **安装 Android Studio**
   - 下载地址: https://developer.android.com/studio
   - 安装时确保选择 Android SDK

2. **配置环境变量**
   - `ANDROID_HOME` 指向 Android SDK 目录
   - 将 `platform-tools` 添加到 PATH

## 打包步骤

### 1. 初始化 Android 项目（首次）

```bash
npm run android:init
```

### 2. 构建并同步

```bash
npm run android:sync
```

### 3. 在 Android Studio 中打开

```bash
npm run android:open
```

### 4. 生成 APK

在 Android Studio 中：
1. 菜单 → Build → Build Bundle(s) / APK(s) → Build APK(s)
2. APK 位置: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. 生成签名的发布版 APK

1. 菜单 → Build → Generate Signed Bundle / APK
2. 选择 APK
3. 创建或选择密钥库
4. 选择 release 构建类型
5. APK 位置: `android/app/release/app-release.apk`

## 权限说明

应用需要以下权限（已在 AndroidManifest.xml 中配置）：

- `READ_EXTERNAL_STORAGE` - 读取音频文件
- `READ_MEDIA_AUDIO` - Android 13+ 读取音频

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run android:init` | 初始化 Android 项目 |
| `npm run android:sync` | 构建 Web 并同步到 Android |
| `npm run android:open` | 在 Android Studio 中打开 |
| `npm run android:run` | 构建并运行（需连接设备或模拟器） |

## 移动端功能说明

在移动端 APK 中：
- 点击"选择目录"会打开系统文件选择器
- 可以选择多个音频文件
- 文件会按名称自然排序
- 播放进度会自动保存

## 故障排除

### Gradle 构建失败
```bash
cd android
./gradlew clean
cd ..
npm run android:sync
```

### 权限问题
确保在 `android/app/src/main/AndroidManifest.xml` 中有：
```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
```
