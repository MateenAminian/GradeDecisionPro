module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Zustand and other ESM packages emit import.meta. Expo's static
          // web export loads the bundle as a classic <script>, which cannot
          // parse that and leaves a blank page.
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
