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

- `INTERNET` - 网络访问（用于下载资源、B站播放）
- `READ_EXTERNAL_STORAGE` - 读取音频文件
- `WRITE_EXTERNAL_STORAGE` - 写入下载的音频文件
- `READ_MEDIA_AUDIO` - Android 13+ 读取音频

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run android:init` | 初始化 Android 项目 |
| `npm run android:sync` | 构建 Web 并同步到 Android |
| `npm run android:open` | 在 Android Studio 中打开 |
| `npm run android:run` | 构建并运行（需连接设备或模拟器） |

## 移动端功能说明

### 本地音频播放
- 点击"选择目录"会打开系统文件选择器
- 可以选择多个音频文件
- 文件会按名称自然排序
- 播放进度会自动保存

### 资源下载
- 支持解析喜马拉雅、蜻蜓FM、懒人听书等平台链接
- 下载的文件保存在 `Documents/FocusGarden/Downloads/` 目录
- 下载完成后可在本地播放器中播放

### B站在线播放
- 支持搜索B站音频内容
- 支持登录后播放高清音频

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
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
```

### 下载文件找不到
下载的文件保存在应用的 Documents 目录下：
- 路径: `Documents/FocusGarden/Downloads/[专辑名]/`
- 可使用文件管理器访问，或在本地播放器中选择该目录
