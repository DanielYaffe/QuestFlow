/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/**/*.test.ts"],
    forceExit: true,
    setupFiles: ["<rootDir>/jest.setup.ts"],
    collectCoverage: true,
    coverageReporters: ["json", "html", "text"]
};