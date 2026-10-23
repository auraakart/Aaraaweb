import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

/// Fetch only the active published society's image from the existing bearer
/// endpoint. No external image URLs, disk cache, redirects or saved credentials.
const maxSocietyLogoBytes = 512 * 1024;
const _timeout = Duration(seconds: 8);
const _pngSignature = <int>[137, 80, 78, 71, 13, 10, 26, 10];

bool validSocietyLogoPngHeader(Uint8List? bytes) {
  if (bytes == null || bytes.length < 57 || bytes.length > maxSocietyLogoBytes) {
    return false;
  }
  for (var i = 0; i < _pngSignature.length; i++) {
    if (bytes[i] != _pngSignature[i]) return false;
  }
  if (String.fromCharCodes(bytes.sublist(12, 16)) != 'IHDR') return false;
  final width = (bytes[16] << 24) | (bytes[17] << 16) |
      (bytes[18] << 8) | bytes[19];
  final height = (bytes[20] << 24) | (bytes[21] << 16) |
      (bytes[22] << 8) | bytes[23];
  return width >= 64 && width <= 1024 && height >= 64 && height <= 1024 &&
      bytes[24] == 8 && (bytes[25] == 2 || bytes[25] == 6) &&
      bytes[26] == 0 && bytes[27] == 0 && bytes[28] == 0;
}

/// Never send a bearer token over plain HTTP to a remote host.
/// Local-only emulator endpoints remain permitted for developer builds.
bool allowedPublishedLogoUri(Uri uri) {
  if (uri.host.isEmpty || uri.hasQuery || uri.hasFragment ||
      uri.userInfo.isNotEmpty ||
      !uri.path.endsWith('/api/v1/context/logo')) return false;
  if (uri.scheme == 'https') return true;
  if (uri.scheme != 'http') return false;
  return {'localhost', '127.0.0.1', '::1', '10.0.2.2'}
      .contains(uri.host.toLowerCase());
}

/// Presentation-only: a missing, offline, corrupt or revoked logo is null.
/// Authorization, publication and full CRC/hash checking occur on the server.
Future<Uint8List?> fetchPublishedSocietyLogo({
  required String baseUrl,
  required String accessToken,
  String? expectedRevision,
}) async {
  if (accessToken.isEmpty) return null;
  final root = baseUrl.replaceFirst(RegExp(r'/$'), '');
  final uri = Uri.tryParse('$root/api/v1/context/logo');
  if (uri == null || !allowedPublishedLogoUri(uri)) return null;
  final client = HttpClient();
  try {
    final request = await client.getUrl(uri).timeout(_timeout);
    request.followRedirects = false;
    if (expectedRevision != null) {
      if (!RegExp(r'^society-[0-9a-fA-F-]{36}-v(?:0|[1-9][0-9]*)(?:-p[1-9][0-9]*)?$').hasMatch(expectedRevision)) return null;
      request.headers.set(HttpHeaders.ifMatchHeader, '"$expectedRevision"');
    }
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    request.headers.set(HttpHeaders.acceptHeader, 'image/png');
    request.headers.set(HttpHeaders.cacheControlHeader, 'no-store');
    request.headers.set(HttpHeaders.acceptEncodingHeader, 'identity');
    final response = await request.close().timeout(_timeout);
    if (response.statusCode != HttpStatus.ok ||
        response.headers.contentType?.mimeType != 'image/png' ||
        response.contentLength > maxSocietyLogoBytes) return null;
    // Enforce a total body deadline, not a per-chunk resettable timer. A slow
    // peer must not hold a credential-bearing HTTP request open indefinitely.
    Future<Uint8List?> readBoundedBody() async {
      final bytes = BytesBuilder(copy: false);
      var total = 0;
      await for (final chunk in response) {
        total += chunk.length;
        if (total > maxSocietyLogoBytes) return null;
        bytes.add(chunk);
      }
      if (response.contentLength >= 0 && total != response.contentLength) {
        return null; // Reject declared-length mismatch or truncated transport.
      }
      final image = bytes.takeBytes();
      return validSocietyLogoPngHeader(image) ? image : null;
    }
    return await readBoundedBody().timeout(_timeout);
  } on Exception {
    return null;
  } finally {
    client.close(force: true);
  }
}
