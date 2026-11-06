import { registerRootComponent } from 'expo';
import App from '../App';

export function boot(): void {
  registerRootComponent(App);
}
