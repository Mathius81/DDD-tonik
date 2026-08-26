/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Configurația de împachetare. `appCopyright` ajunge în metadatele fișierului
 * executabil: pe Windows se vede în Proprietăți → Detalii, deci autorul rămâne
 * vizibil chiar și pentru cine nu are codul sursă.
 */
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'DDDManager',
    executableName: 'DDDManager',
    appBundleId: 'ro.dddmanager.app',
    appCopyright: 'Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.',
    win32metadata: {
      CompanyName: 'Marius Constantinescu',
      FileDescription: 'Tonik — DDD Manager',
      ProductName: 'Tonik — DDD Manager',
      OriginalFilename: 'DDDManager.exe',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'ddd_manager',
      setupExe: 'DDDManager-Setup.exe',
      authors: 'Marius Constantinescu',
      owners: 'Marius Constantinescu',
      copyright: 'Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.',
      description: 'Tonik — DDD Manager, creație originală a lui Marius Constantinescu.',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
