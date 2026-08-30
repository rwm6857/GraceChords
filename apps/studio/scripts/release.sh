#!/bin/bash
#
# release.sh — build, sign, notarize and package GraceChords Studio for direct
# download.
#
# Studio is distributed as a notarized DMG rather than through the Mac App Store,
# so the whole of "will this open on somebody else's Mac" is this script: a
# Developer ID Application signature, the hardened runtime (already on in the
# project), a successful notarization, and a stapled ticket.
#
#   ./apps/studio/scripts/release.sh --check         # preflight only, changes nothing
#   ./apps/studio/scripts/release.sh --version 1.1.0 --build 4
#
# What it needs, and where each piece comes from:
#
#   Developer ID Application certificate   Apple Developer account ▸ Certificates.
#                                          `security find-identity -v -p codesigning`
#                                          must list one. An "Apple Development"
#                                          certificate is NOT it — that one signs
#                                          builds for machines already in your
#                                          provisioning profile, which is every Mac
#                                          you are not shipping to.
#
#   A notarytool keychain profile          One-time, and it is what keeps the
#                                          app-specific password out of this file:
#                                            xcrun notarytool store-credentials \
#                                              gracechords-studio \
#                                              --apple-id you@example.com \
#                                              --team-id J7Y8NYZ48Q \
#                                              --password <app-specific-password>
#                                          App-specific passwords are made at
#                                          appleid.apple.com, not your Apple ID
#                                          password.
#
#   SUPABASE_URL / SUPABASE_ANON_KEY       The same public-safe values apps/mobile
#                                          uses. These are baked into the built
#                                          app's Info.plist, because the scheme
#                                          environment variables that supply them
#                                          during development do not exist for
#                                          somebody who double-clicks the app. The
#                                          anon key is the public client key and
#                                          belongs in a shipped bundle; RLS is what
#                                          enforces access. Never the service-role
#                                          key.
#
#   API_BASE_URL                           Optional. Without it Export is disabled
#                                          and nothing else changes. Must be the
#                                          canonical origin — an apex that redirects
#                                          to www turns the POST into a GET and the
#                                          API answers 405.
#
set -euo pipefail

readonly TEAM_ID="J7Y8NYZ48Q"
readonly SCHEME="GraceChords Studio"
readonly APP_NAME="GraceChords Studio"
readonly NOTARY_PROFILE="${NOTARY_PROFILE:-gracechords-studio}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly STUDIO_DIR="$(dirname "$SCRIPT_DIR")"
readonly PROJECT="$STUDIO_DIR/GraceChords Studio/GraceChords Studio.xcodeproj"
readonly BUILD_DIR="$STUDIO_DIR/build"
readonly ARCHIVE="$BUILD_DIR/$APP_NAME.xcarchive"
readonly EXPORT_DIR="$BUILD_DIR/export"
readonly APP="$EXPORT_DIR/$APP_NAME.app"

CHECK_ONLY=false
VERSION=""
BUILD_NUMBER=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		--check)   CHECK_ONLY=true; shift ;;
		--version) VERSION="${2:?--version needs a value}"; shift 2 ;;
		--build)   BUILD_NUMBER="${2:?--build needs a value}"; shift 2 ;;
		-h|--help) sed -n '2,50p' "${BASH_SOURCE[0]}"; exit 0 ;;
		*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done

# Read a command's output into a variable and test *that*, rather than piping into
# `grep -q`. `grep -q` exits on its first match, which closes the pipe and kills the
# producer with SIGPIPE (exit 141); under `set -o pipefail` the pipeline then reports
# failure even though the grep matched. That turned a correctly hardened, correctly
# signed app into "the hardened runtime is not enabled". Same hazard applies to any
# `| head -1`, hence `first_line`.
first_line() { printf '%s' "${1%%$'\n'*}"; }

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------- preflight
#
# Everything that can be known before a twenty-minute build is checked here, so a
# missing app-specific password is discovered in two seconds rather than after the
# archive.

step "Preflight"

command -v xcodebuild >/dev/null || fail "xcodebuild not found. Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app"
ok "Xcode: $(first_line "$(xcodebuild -version)")"

CODESIGN_IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
SIGNING_IDENTITY="$(first_line "$(printf '%s\n' "$CODESIGN_IDENTITIES" \
	| sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p')")"

if [[ -z "$SIGNING_IDENTITY" ]]; then
	printf '\033[31m✗ No "Developer ID Application" certificate in the keychain.\033[0m\n' >&2
	echo >&2
	echo "  What is there now:" >&2
	printf '%s\n' "$CODESIGN_IDENTITIES" | sed 's/^/    /' >&2
	echo >&2
	echo "  An \"Apple Development\" certificate cannot sign for distribution — it only" >&2
	echo "  works on machines in your provisioning profile. Create the right one at" >&2
	echo "  https://developer.apple.com/account/resources/certificates ▸ + ▸" >&2
	echo "  \"Developer ID Application\", download it, and double-click to install." >&2
	echo "  It needs the Account Holder or Admin role on team $TEAM_ID." >&2
	exit 1
fi
ok "Signing identity: $SIGNING_IDENTITY"

if xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
	ok "Notary profile: $NOTARY_PROFILE"
else
	fail "No usable notarytool profile named '$NOTARY_PROFILE'. Create one with:
    xcrun notarytool store-credentials $NOTARY_PROFILE \\
      --apple-id <your-apple-id> --team-id $TEAM_ID --password <app-specific-password>
  (Set NOTARY_PROFILE to use a different name.)"
fi

: "${SUPABASE_URL:?SUPABASE_URL is not set. Use the same value as apps/mobile/.env's EXPO_PUBLIC_SUPABASE_URL.}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is not set. Use apps/mobile/.env's EXPO_PUBLIC_SUPABASE_ANON_KEY — the anon key, never the service-role key.}"
ok "Supabase URL: $SUPABASE_URL"

case "$SUPABASE_ANON_KEY" in
	*service_role*) fail "SUPABASE_ANON_KEY looks like a service-role key. That key bypasses RLS and must never ship in a client." ;;
esac
ok "Supabase anon key: ${#SUPABASE_ANON_KEY} characters"

API_BASE_URL="${API_BASE_URL:-}"
if [[ -n "$API_BASE_URL" ]]; then
	ok "API base URL: $API_BASE_URL"
else
	warn "API_BASE_URL not set — Export (PDF/JPG and Telegram push) will be disabled in this build."
fi

if $CHECK_ONLY; then
	printf '\n\033[32mPreflight passed. Re-run without --check to build.\033[0m\n'
	exit 0
fi

# ------------------------------------------------------------------ archive

step "Archive"
rm -rf "$ARCHIVE" "$EXPORT_DIR"
mkdir -p "$BUILD_DIR"

version_overrides=()
if [[ -n "$VERSION" ]]; then version_overrides+=("MARKETING_VERSION=$VERSION"); fi
if [[ -n "$BUILD_NUMBER" ]]; then version_overrides+=("CURRENT_PROJECT_VERSION=$BUILD_NUMBER"); fi

xcodebuild archive \
	-project "$PROJECT" \
	-scheme "$SCHEME" \
	-configuration Release \
	-destination 'generic/platform=macOS' \
	-archivePath "$ARCHIVE" \
	-allowProvisioningUpdates \
	DEVELOPMENT_TEAM="$TEAM_ID" \
	${version_overrides[@]+"${version_overrides[@]}"}
ok "Archived"

step "Export"
xcodebuild -exportArchive \
	-archivePath "$ARCHIVE" \
	-exportOptionsPlist "$SCRIPT_DIR/ExportOptions.plist" \
	-exportPath "$EXPORT_DIR" \
	-allowProvisioningUpdates
[[ -d "$APP" ]] || fail "Export produced no app at $APP"

RESOLVED_VERSION="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString)"
RESOLVED_BUILD="$(defaults read "$APP/Contents/Info" CFBundleVersion)"
ok "Exported $APP_NAME $RESOLVED_VERSION ($RESOLVED_BUILD)"

# ------------------------------------------------------------- configuration
#
# The credentials go in here, after the export, rather than as build settings.
# `INFOPLIST_KEY_<name>` only maps the keys Xcode already knows — a custom name is
# accepted on the command line and silently dropped, which produces a signed,
# notarized, published build that shows "Studio is not configured" to everyone who
# downloads it. Writing the keys and re-signing is the version that can be checked,
# and it is checked below.
#
# The entitlements are read back off the exported app and passed to the re-sign
# explicitly: `codesign --force` without them drops the lot, and an app that has
# lost com.apple.security.network.client cannot reach Supabase at all.

step "Embed configuration"
readonly ENTITLEMENTS="$BUILD_DIR/entitlements.plist"
codesign -d --entitlements "$ENTITLEMENTS" --xml "$APP" 2>/dev/null \
	|| fail "Could not read the exported app's entitlements."

if grep -q 'get-task-allow' "$ENTITLEMENTS"; then
	fail "The exported app carries com.apple.security.get-task-allow, a debug entitlement. Notarization rejects it — export from a Release archive, not a Debug build."
fi

plutil -replace SUPABASE_URL -string "$SUPABASE_URL" "$APP/Contents/Info.plist"
plutil -replace SUPABASE_ANON_KEY -string "$SUPABASE_ANON_KEY" "$APP/Contents/Info.plist"
plutil -replace API_BASE_URL -string "$API_BASE_URL" "$APP/Contents/Info.plist"

# --timestamp, not --timestamp=none: notarization requires a secure timestamp from
# Apple's server, so this step needs the network.
codesign --force --options runtime --timestamp \
	--entitlements "$ENTITLEMENTS" \
	--sign "$SIGNING_IDENTITY" "$APP"
ok "Configuration embedded and app re-signed"

# ------------------------------------------------------------------- verify
#
# Before notarization, because these are the failures whose cause is legible
# locally. Notarization's rejection for an unsigned nested binary is a JSON log
# you have to go and fetch.

step "Verify the signature"
codesign --verify --deep --strict --verbose=2 "$APP"
ok "Signature valid"

SIGNATURE_INFO="$(codesign -d --verbose=2 "$APP" 2>&1 || true)"
case "$SIGNATURE_INFO" in
	*"(runtime)"*) ok "Hardened runtime enabled" ;;
	*) fail "The hardened runtime is not enabled. Notarization requires it (ENABLE_HARDENED_RUNTIME in the project).
  codesign reported:
$(printf '%s\n' "$SIGNATURE_INFO" | sed 's/^/    /')" ;;
esac

# The credentials actually made it in, and survived the re-sign. A build that ships
# without them shows the "Studio is not configured" screen, which to somebody who
# just downloaded it looks like a broken download.
[[ "$(plutil -extract SUPABASE_URL raw "$APP/Contents/Info.plist" 2>/dev/null)" == "$SUPABASE_URL" ]] \
	|| fail "SUPABASE_URL did not reach the built Info.plist."
[[ "$(plutil -extract SUPABASE_ANON_KEY raw "$APP/Contents/Info.plist" 2>/dev/null)" == "$SUPABASE_ANON_KEY" ]] \
	|| fail "SUPABASE_ANON_KEY did not reach the built Info.plist."
ok "Configuration present in the signed bundle"

# The sandbox is what keeps a stray entitlement from being the thing nobody noticed.
SIGNED_ENTITLEMENTS="$(codesign -d --entitlements - --xml "$APP" 2>/dev/null || true)"
case "$SIGNED_ENTITLEMENTS" in
	*network.client*) ok "Network entitlement intact" ;;
	*) fail "The signed app has lost com.apple.security.network.client and cannot reach Supabase." ;;
esac

# ------------------------------------------------------------- notarize app
#
# Twice, deliberately. Notarizing the zip and stapling the .app means the app
# opens even when somebody copies it out of the DMG and passes it on; notarizing
# the DMG means the DMG itself opens without a warning. Stapling only the DMG
# leaves the extracted app relying on Gatekeeper reaching Apple online.

step "Notarize the app"
readonly ZIP="$BUILD_DIR/$APP_NAME.zip"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait || {
	echo >&2
	echo "  Fetch the reason with:" >&2
	echo "    xcrun notarytool log <submission-id> --keychain-profile $NOTARY_PROFILE" >&2
	exit 1
}
xcrun stapler staple "$APP"
ok "App notarized and stapled"

# ----------------------------------------------------------------- package

step "Build the DMG"
readonly DMG="$BUILD_DIR/$APP_NAME $RESOLVED_VERSION.dmg"
readonly STAGING="$BUILD_DIR/dmg"
rm -rf "$STAGING" "$DMG"
mkdir -p "$STAGING"
# ditto, not cp -R: it is the copy Apple documents for signed bundles, and it
# carries the extended attributes and the stapled ticket across intact. A signature
# broken here would not surface until the final Gatekeeper check, two notarization
# round trips later.
ditto "$APP" "$STAGING/$APP_NAME.app"
# The /Applications alias is the whole install instruction: drag left to right.
ln -s /Applications "$STAGING/Applications"
hdiutil create \
	-volname "$APP_NAME" \
	-srcfolder "$STAGING" \
	-ov -format UDZO \
	"$DMG"
rm -rf "$STAGING"

codesign --sign "$SIGNING_IDENTITY" --timestamp "$DMG"
ok "DMG signed"

step "Notarize the DMG"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait || {
	echo >&2
	echo "  Fetch the reason with:" >&2
	echo "    xcrun notarytool log <submission-id> --keychain-profile $NOTARY_PROFILE" >&2
	exit 1
}
xcrun stapler staple "$DMG"
ok "DMG notarized and stapled"

# ------------------------------------------------------------- final check
#
# What a downloader's Mac will actually do, run here so a bad release is caught
# before it is published rather than by the first person to open it.

step "Gatekeeper"
spctl --assess --type open --context context:primary-signature -v "$DMG"
xcrun stapler validate "$DMG"
ok "Gatekeeper accepts the DMG"

printf '\n\033[32m✓ %s %s (%s)\033[0m\n' "$APP_NAME" "$RESOLVED_VERSION" "$RESOLVED_BUILD"
printf '  %s\n' "$DMG"
printf '  %s\n\n' "$(du -h "$DMG" | cut -f1) — ready to publish"
