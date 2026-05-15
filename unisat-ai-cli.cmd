@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if exist "%ROOT_DIR%..\unisat-dev-docs" (
  set "UNISAT_DEV_DOCS_DIR=%UNISAT_DEV_DOCS_DIR%"
  if not defined UNISAT_DEV_DOCS_DIR set "UNISAT_DEV_DOCS_DIR=%ROOT_DIR%..\unisat-dev-docs"
)

if not defined OPENAPI_SWAGGER_DIR set "OPENAPI_SWAGGER_DIR=%ROOT_DIR%swagger"

node "%ROOT_DIR%packages\cli\bin\unisat-ai.js" %*
