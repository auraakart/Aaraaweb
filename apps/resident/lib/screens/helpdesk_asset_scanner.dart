import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../localization/aaraagate_strings.dart';

class HelpdeskAssetScanner extends StatefulWidget {
  const HelpdeskAssetScanner({super.key});
  @override
  State<HelpdeskAssetScanner> createState() => _HelpdeskAssetScannerState();
}

class _HelpdeskAssetScannerState extends State<HelpdeskAssetScanner> with WidgetsBindingObserver {
  final controller = MobileScannerController(formats: [BarcodeFormat.qrCode]);
  bool completed = false;
  @override
  void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); }
  @override
  void dispose() { WidgetsBinding.instance.removeObserver(this); controller.dispose(); super.dispose(); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !completed) { controller.start().catchError((Object _) {}); }
    else { controller.stop().catchError((Object _) {}); }
  }
  @override
  Widget build(BuildContext context) {
    final copy = AaraagateStrings.device();
    return Scaffold(appBar: AppBar(title: Text(copy.text('helpdeskScanAsset'))), body: Column(children: [
      Padding(padding: const EdgeInsets.all(16), child: Text(copy.text('helpdeskAssetScanHint'))),
      Expanded(child: MobileScanner(controller: controller,
        errorBuilder: (_,_) => Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(copy.text('helpdeskCameraUnavailable')))),
        onDetect: (capture) {
          for (final barcode in capture.barcodes) {
            final value = barcode.rawValue;
            if (!completed && value != null && value.toUpperCase().startsWith('AG-ASSET:')) {
              completed = true; controller.stop().catchError((Object _) {}); Navigator.pop(context, value); break;
            }
          }
        })),
    ]));
  }
}
