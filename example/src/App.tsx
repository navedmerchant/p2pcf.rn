import { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  Button,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import P2PCF, { type Peer } from 'p2pcf.rn';

// Helper functions for text encoding/decoding in React Native
const textToArrayBuffer = (text: string): ArrayBuffer => {
  const utf8 = unescape(encodeURIComponent(text));
  const result = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    result[i] = utf8.charCodeAt(i);
  }
  return result.buffer;
};

const arrayBufferToText = (buffer: ArrayBuffer): string => {
  const arr = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < arr.length; i++) {
    result += String.fromCharCode(arr[i]!);
  }
  return decodeURIComponent(escape(result));
};

export default function App() {
  const [clientId, setClientId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const p2pcfRef = useRef<P2PCF | null>(null);

  useEffect(() => {
    return () => {
      if (p2pcfRef.current) {
        p2pcfRef.current.destroy();
      }
    };
  }, []);

  const connect = async () => {
    if (!clientId.trim() || !roomId.trim()) {
      Alert.alert('Error', 'Please enter both Client ID and Room ID');
      return;
    }

    try {
      const p2pcf = new P2PCF(clientId.trim(), roomId.trim());

      p2pcf.on('peerconnect', (peer: Peer) => {
        console.log('Peer connected:', peer.id);
        addMessage(`Peer connected: ${peer.client_id || peer.id}`);
        setPeers((prev) => [...prev, peer]);
      });

      p2pcf.on('peerclose', (peer: Peer) => {
        console.log('Peer disconnected:', peer.id);
        addMessage(`Peer disconnected: ${peer.client_id || peer.id}`);
        setPeers((prev) => prev.filter((p) => p.id !== peer.id));
      });

      p2pcf.on('msg', (peer: Peer, data: ArrayBuffer) => {
        const message = arrayBufferToText(data);
        addMessage(`${peer.client_id || peer.id}: ${message}`);
      });

      p2pcf.on('error', (error: Error) => {
        console.error('P2PCF Error:', error);
        Alert.alert('Error', error.message);
      });

      await p2pcf.start();
      p2pcfRef.current = p2pcf;
      setIsConnected(true);
      addMessage('Connected to room');
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('Connection Error', (error as Error).message);
    }
  };

  const disconnect = () => {
    if (p2pcfRef.current) {
      p2pcfRef.current.destroy();
      p2pcfRef.current = null;
    }
    setIsConnected(false);
    setPeers([]);
    addMessage('Disconnected from room');
  };

  const sendMessage = () => {
    if (!messageInput.trim()) return;

    if (p2pcfRef.current && peers.length > 0) {
      const data = textToArrayBuffer(messageInput);
      p2pcfRef.current.broadcast(data);
      addMessage(`You: ${messageInput}`);
      setMessageInput('');
    } else {
      Alert.alert('Error', 'No peers connected');
    }
  };

  const addMessage = (msg: string) => {
    setMessages((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>P2PCF React Native Demo</Text>
      </View>

      {!isConnected ? (
        <View style={styles.connectionForm}>
          <TextInput
            style={styles.input}
            placeholder="Client ID (min 4 chars)"
            value={clientId}
            onChangeText={setClientId}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Room ID (min 4 chars)"
            value={roomId}
            onChangeText={setRoomId}
            autoCapitalize="none"
          />
          <Button title="Connect" onPress={connect} />
        </View>
      ) : (
        <View style={styles.chatContainer}>
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>
              Connected to: {roomId} | Peers: {peers.length}
            </Text>
            <Button title="Disconnect" onPress={disconnect} color="#ff3b30" />
          </View>

          <ScrollView style={styles.messagesContainer}>
            {messages.map((msg, index) => (
              <Text key={index} style={styles.message}>
                {msg}
              </Text>
            ))}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder="Type a message..."
              value={messageInput}
              onChangeText={setMessageInput}
              onSubmitEditing={sendMessage}
            />
            <Button
              title="Send"
              onPress={sendMessage}
              disabled={peers.length === 0}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  connectionForm: {
    padding: 16,
    gap: 12,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chatContainer: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#e0e0e0',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  messagesContainer: {
    flex: 1,
    padding: 12,
  },
  message: {
    padding: 8,
    backgroundColor: 'white',
    marginBottom: 8,
    borderRadius: 4,
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    gap: 8,
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
});
