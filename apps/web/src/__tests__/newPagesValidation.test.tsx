// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateRoomPage } from '../pages/CreateRoomPage.js';
import { JoinRoomPage } from '../pages/JoinRoomPage.js';
import * as api from '../services/api.js';

vi.mock('../services/api.js', async () => {
  const actual = await vi.importActual('../services/api.js');
  return {
    ...actual,
    createRoom: vi.fn(),
    createDemoRoom: vi.fn(),
    uploadMedia: vi.fn(),
    abortRoom: vi.fn(),
    checkRoom: vi.fn(),
    getPublicUrl: vi.fn().mockResolvedValue('https://cineva-test.trycloudflare.com'),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('New Cineva Pages — Validation & Prefill Tests', () => {
  describe('CreateRoomPage', () => {
    it('validates empty name on submit and allows room creation without movie', async () => {
      render(
        <MemoryRouter>
          <CreateRoomPage />
        </MemoryRouter>
      );

      const submitBtn = screen.getByRole('button', { name: /create room/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText('Enter a name so your friends know who you are.')).toBeTruthy();
      expect(screen.queryByText('Add a movie to start the room.')).toBeNull();
    });

    it('successfully creates room without uploading a movie beforehand', async () => {
      const mockCreateRoom = vi.mocked(api.createRoom);
      mockCreateRoom.mockResolvedValueOnce({
        room: {
          id: 'room-123',
          roomCode: 'OPT123',
          name: "Abbas's Room",
          hostParticipantId: 'part-123',
          allowGuestControl: true,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          participants: [],
        },
        hostSessionId: 'sess-123',
        hostParticipantId: 'part-123',
      });

      render(
        <MemoryRouter>
          <CreateRoomPage />
        </MemoryRouter>
      );

      const nameInput = screen.getByLabelText(/your display name/i);
      fireEvent.change(nameInput, { target: { value: 'Abbas' } });

      const submitBtn = screen.getByRole('button', { name: /create room/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockCreateRoom).toHaveBeenCalledWith(
          expect.objectContaining({
            displayName: 'Abbas',
            roomName: "Abbas's Room",
          })
        );
      });

      expect(await screen.findByText('Your Watch Room is Ready!')).toBeTruthy();
      expect(screen.getByText('OPT123')).toBeTruthy();
    });

    it('rejects files larger than 5 GB with exact prototype error message', async () => {
      render(
        <MemoryRouter>
          <CreateRoomPage />
        </MemoryRouter>
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      // Create dummy 5.1 GB file
      const largeFile = new File(['x'], 'huge_movie.mp4', { type: 'video/mp4' });
      Object.defineProperty(largeFile, 'size', { value: 5.5 * 1024 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      expect(screen.getByText('This file is over 5 GB. Choose a smaller one.')).toBeTruthy();
    });

    it('displays "Will be converted for browsers" when MKV file is selected', async () => {
      render(
        <MemoryRouter>
          <CreateRoomPage />
        </MemoryRouter>
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mkvFile = new File(['video data'], 'interstellar.mkv', { type: 'video/x-matroska' });
      Object.defineProperty(mkvFile, 'size', { value: 1.5 * 1024 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [mkvFile] } });

      expect(screen.getByText('interstellar.mkv')).toBeTruthy();
      expect(screen.getByText(/Will be converted for browsers/i)).toBeTruthy();
      expect(screen.getByText(/1.5 GB/i)).toBeTruthy();
    });

    it('displays "Ready to play" when MP4 file is selected', async () => {
      render(
        <MemoryRouter>
          <CreateRoomPage />
        </MemoryRouter>
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mp4File = new File(['mp4 content'], 'trailer.mp4', { type: 'video/mp4' });
      Object.defineProperty(mp4File, 'size', { value: 150 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [mp4File] } });

      expect(screen.getByText('trailer.mp4')).toBeTruthy();
      expect(screen.getByText(/Ready to play/i)).toBeTruthy();
    });
  });

  describe('JoinRoomPage', () => {
    it('prefills room code from ?code= query parameter and focuses name input', async () => {
      vi.mocked(api.checkRoom).mockResolvedValueOnce({
        exists: true,
        joinable: true,
        status: 'active',
        isFull: false,
      });

      render(
        <MemoryRouter initialEntries={['/join?code=ABC123']}>
          <Routes>
            <Route path="/join" element={<JoinRoomPage />} />
          </Routes>
        </MemoryRouter>
      );

      const inputs = screen.getAllByLabelText(/Character \d/i) as HTMLInputElement[];
      expect(inputs).toHaveLength(6);
      expect(inputs[0].value).toBe('A');
      expect(inputs[1].value).toBe('B');
      expect(inputs[2].value).toBe('C');
      expect(inputs[3].value).toBe('1');
      expect(inputs[4].value).toBe('2');
      expect(inputs[5].value).toBe('3');

      // Check name field has focus
      const nameInput = screen.getByPlaceholderText('Alex');
      expect(document.activeElement).toBe(nameInput);

      // Verify room check was dispatched
      await waitFor(() => {
        expect(api.checkRoom).toHaveBeenCalledWith('ABC123');
      });
    });

    it('validates incomplete room code (<6 chars) on submit', async () => {
      render(
        <MemoryRouter>
          <JoinRoomPage />
        </MemoryRouter>
      );

      const submitBtn = screen.getByRole('button', { name: /join room/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText('Enter all six characters of the code.')).toBeTruthy();
    });

    it('shows room not found error when checkRoom reports nonexistent room', async () => {
      vi.mocked(api.checkRoom).mockRejectedValueOnce(new Error('Room not found'));

      render(
        <MemoryRouter initialEntries={['/join?code=NOPE99']}>
          <Routes>
            <Route path="/join" element={<JoinRoomPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("That room doesn't exist. Check the code.")).toBeTruthy();
      });
    });
  });
});
