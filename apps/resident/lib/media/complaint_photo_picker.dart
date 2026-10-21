import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:image_picker/image_picker.dart';

abstract class ComplaintPhotoPicker {
  Future<Uint8List?> pick();
}

class DeviceComplaintPhotoPicker implements ComplaintPhotoPicker {
  @override
  Future<Uint8List?> pick() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1024, maxHeight: 1024, imageQuality: 85, requestFullMetadata: false);
    if (file == null) return null;
    if (await file.length() > 10 * 1024 * 1024) throw StateError('Photo is too large');
    final source = await file.readAsBytes();
    final codec = await ui.instantiateImageCodec(source, targetWidth: 1024, allowUpscaling: false);
    try {
      final frame = await codec.getNextFrame();
      try {
        if (frame.image.width > 1024 || frame.image.height > 1024) throw StateError('Photo dimensions are too large');
        final encoded = await frame.image.toByteData(format: ui.ImageByteFormat.png);
        if (encoded == null) throw StateError('Photo could not be converted');
        final clean = stripPhotoMetadata(encoded.buffer.asUint8List());
        if (clean.length > 2 * 1024 * 1024) throw StateError('Photo is too large');
        return clean;
      } finally { frame.image.dispose(); }
    } finally { codec.dispose(); }
  }
}

/// Keep only the static PNG chunks accepted by the existing server validator.
Uint8List stripPhotoMetadata(Uint8List input) {
  if (input.length < 8) throw StateError('Invalid photo');
  final result = BytesBuilder(copy: false)..add(input.sublist(0, 8));
  final data = ByteData.sublistView(input);
  var offset = 8;
  while (offset < input.length) {
    if (offset + 12 > input.length) throw StateError('Invalid photo');
    final length = data.getUint32(offset);
    final end = offset + 12 + length;
    if (end > input.length) throw StateError('Invalid photo');
    final type = String.fromCharCodes(input.sublist(offset + 4, offset + 8));
    if (type == 'IHDR' || type == 'IDAT' || type == 'IEND') {
      result.add(input.sublist(offset, end));
    } else if ((input[offset + 4] & 0x20) == 0) {
      throw StateError('Unsupported photo encoding');
    }
    offset = end;
  }
  return result.takeBytes();
}
