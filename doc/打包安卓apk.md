npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "应用名" "com.example.app"
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug