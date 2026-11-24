export class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static clearInstances() {
    MockWebSocket.instances = [];
  }

  url: string;
  protocols?: string | string[];
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  sentData: Array<string | ArrayBuffer | Blob | ArrayBufferView> = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView) {
    this.sentData.push(data);
  }

  close(code = 1000, reason = 'Normal Closure') {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason, wasClean: true }));
    }
  }

  // Helper method for tests to simulate incoming server message
  simulateMessage(data: any) {
    if (this.onmessage) {
      const msgData = typeof data === 'string' ? data : JSON.stringify(data);
      this.onmessage(new MessageEvent('message', { data: msgData }));
    }
  }

  // Helper method for tests to simulate connection error
  simulateError(errorEvent?: Event) {
    if (this.onerror) {
      this.onerror(errorEvent || new Event('error'));
    }
  }
}

// Attach MockWebSocket to global
if (typeof window !== 'undefined') {
  (window as any).WebSocket = MockWebSocket;
}
