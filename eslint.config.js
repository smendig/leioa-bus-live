import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

const importSortRules = {
  'simple-import-sort/imports': 'error',
  'simple-import-sort/exports': 'error',
}

export default tseslint.config(
  {
    ignores: ['captures/**', 'dist/**', 'ignore/**', 'node_modules/**'],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...pluginVue.configs['flat/strongly-recommended'],
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'simple-import-sort': pluginSimpleImportSort,
    },
    rules: {
      ...importSortRules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'simple-import-sort': pluginSimpleImportSort,
    },
    rules: {
      ...importSortRules,
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts',
          },
          style: {
            allowNoLang: true,
          },
        },
      ],
      'vue/block-order': [
        'error',
        {
          order: ['script', 'template', 'style'],
        },
      ],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      'simple-import-sort': pluginSimpleImportSort,
    },
    rules: {
      ...importSortRules,
    },
  },
  eslintConfigPrettier,
)
