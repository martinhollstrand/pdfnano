# Agent Instructions for PDFNano

This document provides context and guidelines for AI agents working on the `pdfnano` repository.

## 1. Project Context

*   **Name**: `pdfnano`
*   **Description**: A lightweight, dependency-free PDF parser in TypeScript.
*   **Core Philosophy**:
    *   **Robustness**: Handling damaged PDFs.
    *   **Zero External Dependencies**: We build everything from scratch.

## 2. Codebase Structure

*   `src/`: Source code (Parser, Objects, Structure, Utils).
*   `test/`: Unit and integration tests.
*   `examples/`: Usage examples.

## 3. Development Guidelines

### Language
*   **TypeScript**: ES2020 target, CommonJS modules.

### Principles
*   **Boy Scout Rule**: Always leave the code cleaner than you found it.
*   **DRY (Don't Repeat Yourself)**: Reuse existing helpers and patterns.
*   **Zero Dependencies**: **STRICTLY FORBIDDEN** to add external runtime dependencies. The goal is a pure, lightweight implementation.

### Style
*   Clean code.
*   Meaningful variable names.
*   Comprehensive JSDoc comments.

## 4. Workflow & Verification

*   **Build**: `npm run build`
*   **Test**: `npm test` (run tests before and after changes).
*   **Lint**: `npm run lint` (uses `tsc --noEmit`).

## 5. Specific User Instructions

*   **Next.js 15**: Note that in Next.js 15, `params` and `searchParams` in Server Components are now Promises that must be awaited. (This is a general user preference, though less relevant for this library logic, good for context if integration code is added).
