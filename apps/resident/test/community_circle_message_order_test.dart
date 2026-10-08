import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/screens/community_circles_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('community circle messages display oldest to newest', () {
    final source = <Map<String, dynamic>>[
      {'id': 'post-3', 'body': 'Newest', 'createdAt': '2026-10-07T15:00:00Z'},
      {'id': 'post-1', 'body': 'Oldest', 'createdAt': '2026-10-07T13:00:00Z'},
      {'id': 'post-2', 'body': 'Middle', 'createdAt': '2026-10-07T14:00:00Z'},
    ];

    final ordered = orderCommunityCirclePostsForDisplay(source);

    expect(ordered.map((post) => post['body']), ['Oldest', 'Middle', 'Newest']);
    expect(source.first['body'], 'Newest', reason: 'Presentation ordering must not mutate repository data.');
  });

  test('demo community circle appends newly posted messages', () async {
    final repository = DemoResidentRepository();

    await repository.createCommunityCirclePost(circleId: 'demo-circle-1', body: 'Latest message');
    final posts = await repository.communityCirclePosts('demo-circle-1');

    expect(posts.last['body'], 'Latest message');
    expect(posts.last['mine'], isTrue);
    expect(posts.last['senderName'], isNotEmpty);
    final home = (await repository.households()).first;
    expect(posts.last['senderFlat'], '${home['buildingName']} · ${home['unitNumber']}');
  });
  test('sender labels include the name and flat number', () {
    expect(circleSenderLabel({'senderName': 'Arun Kumar', 'senderFlat': 'A · 204'}), 'Arun Kumar · A · 204');
    expect(circleSenderLabel({'senderName': 'Priya Sharma', 'senderFlat': 'B · 302', 'mine': true}), 'You (Priya Sharma) · B · 302');
  });
  test('demo requests remain pending without publishing', () async {
    final repository = DemoResidentRepository();
    await repository.requestCommunityCircle(name: 'Walking neighbours');
    expect((await repository.communityCircleRequests()).single['status'], 'PENDING');
    expect((await repository.communityCircles()).any((circle) => circle['name'] == 'Walking neighbours'), isFalse);
  });
  test('demo reporting requires membership', () async {
    final repository = DemoResidentRepository();
    await repository.reportCommunityCirclePost(circleId: 'demo-circle-1', postId: 'demo-circle-post-1', reason: 'Inappropriate content');
    await repository.leaveCommunityCircle('demo-circle-1');
    await expectLater(repository.reportCommunityCirclePost(circleId: 'demo-circle-1', postId: 'demo-circle-post-1', reason: 'Inappropriate content'), throwsStateError);
  });
}
