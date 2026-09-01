import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class GuardQrScanner extends StatefulWidget {
  const GuardQrScanner({super.key});
  @override State<GuardQrScanner> createState() => _GuardQrScannerState();
}

class _GuardQrScannerState extends State<GuardQrScanner> {
  final scanner = MobileScannerController();
  bool handled = false;

  @override void dispose() { scanner.dispose(); super.dispose(); }

  void _handle(String value) {
    if (handled || value.trim().isEmpty) return;
    handled = true;
    scanner.stop();
    Navigator.pop(context, value.trim());
  }

  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Scan visitor pass')),
    body: Stack(children: [
      MobileScanner(controller: scanner, onDetect: (capture) {
        for (final barcode in capture.barcodes) {
          final value = barcode.rawValue;
          if (value != null) { _handle(value); break; }
        }
      }),
      Center(child: Container(width: 260, height: 260, decoration: BoxDecoration(border: Border.all(width: 3), borderRadius: BorderRadius.circular(20)))),
      const Positioned(left: 24,right: 24,bottom: 32,child: Card(child: Padding(padding: EdgeInsets.all(14),child: Text('Align the visitor QR code inside the frame.',textAlign: TextAlign.center))))
    ]),
  );
}
