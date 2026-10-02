export interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

let deferred: InstallEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallEvent;
});

export const installPrompt = () => deferred;
