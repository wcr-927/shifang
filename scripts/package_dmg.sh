#!/bin/sh
set -eu
version=$(node -p "require('./package.json').version")
app='release/mac-arm64/采章开源版.app'
output="release/Caizhang-$version-macOS-arm64.dmg"
stage=$(mktemp -d "${TMPDIR:-/tmp}/caizhang-dmg.XXXXXX")
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/contents"
codesign --verify --deep --strict "$app"
ditto "$app" "$stage/contents/采章开源版.app"
ln -s /Applications "$stage/contents/Applications"
hdiutil create -volname "采章 $version" -fs HFS+ -format UDZO -srcfolder "$stage/contents" "$stage/package.dmg"
hdiutil verify "$stage/package.dmg"
mv "$stage/package.dmg" "$output"
echo "$output"
