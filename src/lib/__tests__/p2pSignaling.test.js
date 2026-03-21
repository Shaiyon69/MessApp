import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPeerConnection } from '../p2pSignaling';

describe('createPeerConnection', () => {
  let MockRTCPeerConnection;
  let mockPcInstance;
  let originalRTCPeerConnection;

  beforeEach(() => {
    mockPcInstance = {
      connectionState: 'new',
      setRemoteDescription: vi.fn(),
      setLocalDescription: vi.fn(),
      createOffer: vi.fn(),
      createAnswer: vi.fn(),
      addIceCandidate: vi.fn(),
      close: vi.fn(),
      createDataChannel: vi.fn().mockImplementation((label) => ({
        label,
        onmessage: null,
        onopen: null,
        onclose: null,
      })),
    };

    MockRTCPeerConnection = function() {
      return mockPcInstance;
    };

    // Add any static methods we want to spy on here if needed
    // using vi.spyOn(MockRTCPeerConnection, ...)

    // Wrap MockRTCPeerConnection in vi.fn() so we can assert on it as a constructor
    const MockRTCPeerConnectionSpy = vi.fn().mockImplementation(MockRTCPeerConnection);

    originalRTCPeerConnection = global.RTCPeerConnection;
    global.RTCPeerConnection = MockRTCPeerConnectionSpy;
    // We update MockRTCPeerConnection to the spied version so our test assertions work
    MockRTCPeerConnection = MockRTCPeerConnectionSpy;
  });

  afterEach(() => {
    global.RTCPeerConnection = originalRTCPeerConnection;
    vi.clearAllMocks();
  });

  it('initializes RTCPeerConnection with correct iceServers', () => {
    createPeerConnection({});
    expect(MockRTCPeerConnection).toHaveBeenCalledWith({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  });

  it('triggers onIce when a valid ice candidate is found', () => {
    const onIce = vi.fn();
    createPeerConnection({ onIce });

    const candidate = { candidate: 'mock-candidate' };
    mockPcInstance.onicecandidate({ candidate });

    expect(onIce).toHaveBeenCalledWith(candidate);
  });

  it('does not trigger onIce when candidate is null', () => {
    const onIce = vi.fn();
    createPeerConnection({ onIce });

    mockPcInstance.onicecandidate({ candidate: null });

    expect(onIce).not.toHaveBeenCalled();
  });

  it('triggers onOpen when connection state becomes connected', () => {
    const onOpen = vi.fn();
    createPeerConnection({ onOpen });

    mockPcInstance.connectionState = 'connected';
    mockPcInstance.onconnectionstatechange();

    expect(onOpen).toHaveBeenCalled();
  });

  it('triggers onClose when connection state becomes disconnected', () => {
    const onClose = vi.fn();
    createPeerConnection({ onClose });

    mockPcInstance.connectionState = 'disconnected';
    mockPcInstance.onconnectionstatechange();

    expect(onClose).toHaveBeenCalled();
  });

  it('triggers onClose when connection state becomes failed', () => {
    const onClose = vi.fn();
    createPeerConnection({ onClose });

    mockPcInstance.connectionState = 'failed';
    mockPcInstance.onconnectionstatechange();

    expect(onClose).toHaveBeenCalled();
  });

  it('sets up incoming data channel correctly', () => {
    const onData = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();

    createPeerConnection({ onData, onOpen, onClose });

    const mockChannel = {
      onmessage: null,
      onopen: null,
      onclose: null,
    };

    mockPcInstance.ondatachannel({ channel: mockChannel });

    // Simulate events on the channel
    const msg = { data: 'test-data' };
    mockChannel.onmessage(msg);
    expect(onData).toHaveBeenCalledWith(msg);

    mockChannel.onopen();
    expect(onOpen).toHaveBeenCalled();

    mockChannel.onclose();
    expect(onClose).toHaveBeenCalled();
  });

  it('creates and sets up outgoing data channel correctly', () => {
    const onData = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const { createDataChannel } = createPeerConnection({ onData, onOpen, onClose });

    const channel = createDataChannel();
    expect(mockPcInstance.createDataChannel).toHaveBeenCalledWith('messapp-datachannel');

    // Simulate events on the channel
    const msg = { data: 'test-data' };
    channel.onmessage(msg);
    expect(onData).toHaveBeenCalledWith(msg);

    channel.onopen();
    expect(onOpen).toHaveBeenCalled();

    channel.onclose();
    expect(onClose).toHaveBeenCalled();
  });

  it('returns correctly mapped async methods', async () => {
    const {
      setRemoteDescription,
      setLocalDescription,
      createOffer,
      createAnswer,
      addIceCandidate,
    } = createPeerConnection({});

    await setRemoteDescription('remote-desc');
    expect(mockPcInstance.setRemoteDescription).toHaveBeenCalledWith('remote-desc');

    await setLocalDescription('local-desc');
    expect(mockPcInstance.setLocalDescription).toHaveBeenCalledWith('local-desc');

    await createOffer();
    expect(mockPcInstance.createOffer).toHaveBeenCalled();

    await createAnswer();
    expect(mockPcInstance.createAnswer).toHaveBeenCalled();

    await addIceCandidate('candidate');
    expect(mockPcInstance.addIceCandidate).toHaveBeenCalledWith('candidate');
  });

  it('handles close method safely', () => {
    const { close } = createPeerConnection({});

    // Normal close
    close();
    expect(mockPcInstance.close).toHaveBeenCalled();

    // Close with error
    mockPcInstance.close.mockImplementationOnce(() => {
      throw new Error('Close failed');
    });

    // Should not throw
    expect(() => close()).not.toThrow();
  });
});
