module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**.module.ts',
    '!**main.ts',
    '!***.spec.ts',
  ],
  // The tsconfig declares `@app/* -> src/*` and most services import Prisma via
  // `@app/common/services/prisma.service`. Jest never learned that mapping, so
  // any spec touching one of those services failed to resolve at all
  // ("Cannot find module '@app/common/services/prisma.service'").
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/$1',
  },
  // DB-backed specs (account deletion) read DB_REACHABLE at collection time;
  // this probe sets it. See CAL_UPDATE_INFO/COMPLIANCE_LOOP.md decisions.
  globalSetup: '<rootDir>/../scripts/jest-global-setup.js',
  coverageDirectory: '../coverage',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/\\.kilo/'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};
