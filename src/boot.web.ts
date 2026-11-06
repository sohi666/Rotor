import { registerRootComponent } from 'expo';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/** Web is a preview/QA target: Skia needs CanvasKit (WASM) loaded before any Skia module runs. */
export function boot(): void {
  LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(async () => {
    const { default: App } = await import('../App');
    registerRootComponent(App);
  });
}
