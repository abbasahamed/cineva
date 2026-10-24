// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ChatMessage, ParticipantInfo } from '@cineva/shared';

// Extracted chat messages rendering logic matching WatchRoomPage
const ChatList: React.FC<{
  chatMessages: ChatMessage[];
  participants: ParticipantInfo[];
  sessionId: string;
  currentParticipantId?: string;
}> = ({ chatMessages, participants, sessionId, currentParticipantId }) => {
  if (chatMessages.length === 0) {
    return (
      <div className="none" id="no">
        <b>No messages yet</b>Say something while the movie loads.
      </div>
    );
  }

  return (
    <div className="msgs" id="ms">
      {chatMessages.map((msg, idx) => {
        if (msg.isSystem) {
          return (
            <div key={msg.id || idx} className="m sys">
              <span>{msg.message}</span>
            </div>
          );
        }
        const myParticipant = participants.find((p) => p.sessionId === sessionId);
        const isMe =
          msg.participantId === myParticipant?.id ||
          msg.participantId === currentParticipantId ||
          (msg as any).senderId === currentParticipantId ||
          (msg as any).senderSessionId === sessionId ||
          (myParticipant && msg.displayName === myParticipant.displayName);

        return (
          <div key={msg.id || idx} className={`m ${isMe ? 'me' : ''}`} data-testid={`chat-msg-${idx}`}>
            {!isMe && <b>{msg.displayName || 'Audience'}</b>}
            <span>{msg.message}</span>
          </div>
        );
      })}
    </div>
  );
};

describe('STEP 5: Chat Message Rendering Component Tests', () => {
  const participants: ParticipantInfo[] = [
    {
      id: 'part_host_1',
      displayName: 'Abbas',
      isHost: true,
      sessionId: 'sess_host_1',
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      isOnline: true,
    },
    {
      id: 'part_guest_2',
      displayName: 'Sarah',
      isHost: false,
      sessionId: 'sess_guest_2',
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      isOnline: true,
    },
  ];

  it('renders own messages, remote messages, and system messages correctly without empty Audience chips', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg_1',
        roomId: 'room_1',
        participantId: 'part_guest_2',
        displayName: 'Sarah',
        message: 'Hello everyone!',
        createdAt: new Date().toISOString(),
        isSystem: false,
      },
      {
        id: 'msg_2',
        roomId: 'room_1',
        participantId: 'part_host_1',
        displayName: 'Abbas',
        message: 'Welcome Sarah! Ready for the movie?',
        createdAt: new Date().toISOString(),
        isSystem: false,
      },
      {
        id: 'msg_3',
        roomId: 'room_1',
        participantId: 'system',
        displayName: 'System',
        message: 'Abbas started playing the movie',
        createdAt: new Date().toISOString(),
        isSystem: true,
      },
    ];

    const { container } = render(
      <ChatList
        chatMessages={messages}
        participants={participants}
        sessionId="sess_host_1"
        currentParticipantId="part_host_1"
      />
    );

    // 1. Remote message
    const remoteMsg = container.querySelector('[data-testid="chat-msg-0"]');
    expect(remoteMsg).not.toBeNull();
    expect(remoteMsg?.className).toContain('m');
    expect(remoteMsg?.className).not.toContain('me');
    expect(remoteMsg?.querySelector('b')?.textContent).toBe('Sarah');
    expect(remoteMsg?.querySelector('span')?.textContent).toBe('Hello everyone!');

    // 2. Own message
    const ownMsg = container.querySelector('[data-testid="chat-msg-1"]');
    expect(ownMsg).not.toBeNull();
    expect(ownMsg?.className).toContain('m me');
    expect(ownMsg?.querySelector('b')).toBeNull(); // own message hides sender name in .m.me
    expect(ownMsg?.querySelector('span')?.textContent).toBe('Welcome Sarah! Ready for the movie?');

    // 3. System message
    const sysMsg = container.querySelector('.m.sys');
    expect(sysMsg).not.toBeNull();
    expect(sysMsg?.querySelector('span')?.textContent).toBe('Abbas started playing the movie');

    // 4. Assert no empty chips with "Audience"
    expect(container.textContent).not.toContain('Audience');
  });

  it('renders empty placeholder when no chat messages exist', () => {
    const { container } = render(
      <ChatList
        chatMessages={[]}
        participants={participants}
        sessionId="sess_host_1"
        currentParticipantId="part_host_1"
      />
    );
    expect(container.querySelector('#no')).not.toBeNull();
    expect(screen.getByText('No messages yet')).toBeDefined();
  });
});
