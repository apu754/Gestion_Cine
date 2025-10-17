export default {
  testEnvironment: 'node',

  // Setup global antes de cada test (mantiene tu config actual)
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupTestEnv.js'],

  // Verbosidad en consola
  verbose: true,
  // Limpia mocks entre tests
  clearMocks: true,

  // Permite usar ES Modules sin transformadores
  transform: {},
  

  // ---------- Cobertura ----------
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',          // todo el código fuente
    '!src/tests/**',        // excluye los tests
    '!**/node_modules/**',  // excluye dependencias
    '!src/**/*.test.js',    // evita doble conteo
    '!src/**/*.e2e.test.js' // evita E2E en cobertura
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'cobertura'],

  // ---------- Thresholds mínimos ----------
  // (esto te sirve para SonarQube y prácticas de Calidad de Software)
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40
    }
  }
  
};
