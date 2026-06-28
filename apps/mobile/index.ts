import { registerRootComponent } from "expo";
import App from "./App";

// registerRootComponent は AppRegistry.registerComponent を呼び、
// Expo Go / ネイティブビルドのどちらでも適切に環境を整える。
registerRootComponent(App);
