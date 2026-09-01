import 'package:flutter/material.dart';
import '../guard_controller.dart';
import '../qr_scanner.dart';

class GuardOperationsScreen extends StatefulWidget {
  const GuardOperationsScreen({super.key, required this.controller});
  final GuardController controller;

  @override
  State<GuardOperationsScreen> createState() => _GuardOperationsScreenState();
}

class _GuardOperationsScreenState extends State<GuardOperationsScreen> {
  final credential = TextEditingController();

  @override
  void dispose() {
    credential.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    final value = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const GuardQrScanner()));
    if (!mounted || value == null || value.trim().isEmpty) return;
    credential.text = value.trim();
    await widget.controller.verifyCredential(credential.text);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final access = c.verifiedAccess;
    final status = access?['status']?.toString();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gate Operations', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [IconButton(onPressed: c.busy ? null : c.signOut, tooltip: 'Sign out', icon: const Icon(Icons.logout_rounded))],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: c.loadGates,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
            children: [
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: const CircleAvatar(radius: 25, child: Icon(Icons.security_rounded, size: 28)),
                  title: const Text('Security shift active', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: Text(c.gateName ?? 'Select your gate'),
                  trailing: const Icon(Icons.circle, size: 12),
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: c.gateId,
                decoration: const InputDecoration(labelText: 'Active gate / सक्रिय गेट', prefixIcon: Icon(Icons.door_front_door_outlined), border: OutlineInputBorder()),
                items: c.gates.map((gate) => DropdownMenuItem(value: gate['id']?.toString(), child: Text((gate['name'] ?? gate['code'] ?? 'Gate').toString()))).toList(),
                onChanged: c.busy ? null : c.selectGate,
              ),
              if (c.gates.isEmpty) ...[
                const SizedBox(height: 10),
                const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('No active gate is configured for this society.'))),
              ],
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: c.busy || c.gateId == null ? null : _scan,
                icon: const Icon(Icons.qr_code_scanner_rounded, size: 32),
                label: const Text('SCAN QR / QR स्कैन करें', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(72)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: credential,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(labelText: 'Manual credential / कोड', prefixIcon: Icon(Icons.keyboard_alt_outlined), border: OutlineInputBorder()),
                onSubmitted: c.busy || c.gateId == null ? null : c.verifyCredential,
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: c.busy || c.gateId == null ? null : () => c.verifyCredential(credential.text),
                icon: const Icon(Icons.verified_user_outlined),
                label: const Text('VERIFY / जाँच करें', style: TextStyle(fontWeight: FontWeight.w800)),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              ),
              if (c.busy) const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: LinearProgressIndicator()),
              if (c.error != null) ...[
                const SizedBox(height: 12),
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: Padding(padding: const EdgeInsets.all(14), child: Text(c.error!, style: const TextStyle(fontWeight: FontWeight.w700))),
                ),
              ],
              if (access != null) ...[
                const SizedBox(height: 18),
                _AccessResultCard(access: access),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: c.busy || status == 'CHECKED_IN' || status == 'CHECKED_OUT' ? null : () => c.checkIn(credential.text),
                        icon: const Icon(Icons.login_rounded),
                        label: const Text('ENTER\nअंदर', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)),
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: c.busy || status != 'CHECKED_IN' ? null : () => c.checkOut(credential.text),
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('EXIT\nबाहर', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)),
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(68)),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 22),
              Card(
                child: ListTile(
                  leading: Icon(c.queuedActions == 0 ? Icons.cloud_done_outlined : Icons.cloud_off_outlined),
                  title: Text(c.queuedActions == 0 ? 'Online operations clear' : '${c.queuedActions} offline actions pending', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(c.queuedActions == 0 ? 'No locally queued gate actions.' : 'Stored securely for supervisor review and safe sync.'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccessResultCard extends StatelessWidget {
  const _AccessResultCard({required this.access});
  final Map<String, dynamic> access;

  @override
  Widget build(BuildContext context) {
    final status = access['status']?.toString() ?? 'UNKNOWN';
    final positive = status == 'APPROVED' || status == 'CHECKED_IN';
    final subject = access['subjectName']?.toString() ?? 'Access holder';
    final type = access['subjectType']?.toString().replaceAll('_', ' ') ?? 'ACCESS';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: positive ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.errorContainer,
                  child: Icon(positive ? Icons.check_rounded : Icons.block_rounded, size: 30),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(subject, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900))),
              ],
            ),
            const SizedBox(height: 14),
            Text(type, style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(status.replaceAll('_', ' '), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: positive ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.error)),
          ],
        ),
      ),
    );
  }
}
