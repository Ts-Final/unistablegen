const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const pluginVue = require('eslint-plugin-vue');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'out/**', 'resources/**'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      // 关闭 require 导入限制，允许配置文件使用 require
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];