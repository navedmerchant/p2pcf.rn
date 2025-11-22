import { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { P2PCF, type Peer } from 'p2pcf.rn';

interface Message {
  id: string;
  text: string;
  fromSelf: boolean;
  timestamp: number;
}

export default function App() {
  // Connection settings
  const [workerUrl] = useState('https://p2pcf.mindrop.workers.dev');
  const [roomId, setRoomId] = useState('CY5WRMY76');
  const [clientId, setClientId] = useState(
    `mobile-${Math.random().toString(36).substring(2, 8)}`
  );

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  // Messaging
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  // P2PCF instance
  const p2pcfRef = useRef<P2PCF | null>(null);
  const scrollViewRef = useRef<any>(null);

  // Initialize P2PCF when connected
  const handleConnect = async () => {
    if (!workerUrl || !roomId || !clientId) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      setConnectionStatus('Connecting...');

      // Create P2PCF instance (mobile mode)
      const p2pcf = new P2PCF(clientId, roomId, {
        isDesktop: false,
        workerUrl: workerUrl,
        pollingInterval: 3000,
      });

      // Setup event listeners
      p2pcf.on('peerconnect', (peer: Peer) => {
        console.log('Peer connected:', peer);
        setIsConnected(true);
        setConnectionStatus(`Connected to ${peer.clientId}`);
        addSystemMessage(`Connected to desktop: ${peer.clientId}`);
      });

      p2pcf.on('peerclose', (peer: Peer) => {
        console.log('Peer disconnected:', peer);
        setIsConnected(false);
        setConnectionStatus('Desktop disconnected');
        addSystemMessage(`Desktop disconnected: ${peer.clientId}`);
      });

      p2pcf.on('msg', (_peer: Peer, data: ArrayBuffer) => {
        const text = new TextDecoder().decode(data);
        console.log('Received message:', text);
        addMessage(text, false);
      });

      p2pcf.on('error', (error: Error) => {
        console.error('P2PCF Error:', error);
        Alert.alert('Error', error.message);
      });

      // Start P2PCF
      await p2pcf.start();
      p2pcfRef.current = p2pcf;

      addSystemMessage('Waiting for desktop...');
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionStatus('Connection failed');
      Alert.alert(
        'Connection Failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  // Disconnect from P2PCF
  const handleDisconnect = async () => {
    if (p2pcfRef.current) {
      await p2pcfRef.current.destroy();
      p2pcfRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus('Disconnected');
    addSystemMessage('Disconnected from room');
  };

  // Send a message
  const handleSend = () => {
    if (!inputText.trim() || !isConnected || !p2pcfRef.current) {
      return;
    }

    try {
      // Send message to desktop
      p2pcfRef.current.broadcast(inputText);
      addMessage(inputText, true);
      setInputText('');
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert(
        'Send Failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  // Add a message to the list
  const addMessage = (text: string, fromSelf: boolean) => {
    const message: Message = {
      id: `${Date.now()}-${Math.random()}`,
      text,
      fromSelf,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, message]);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Add a system message
  const addSystemMessage = (text: string) => {
    const message: Message = {
      id: `${Date.now()}-${Math.random()}`,
      text: `[SYSTEM] ${text}`,
      fromSelf: false,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, message]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (p2pcfRef.current) {
        p2pcfRef.current.destroy();
      }
    };
  }, []);

  // Connection setup view
  if (!isConnected && !p2pcfRef.current) {
    return (
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.setupContainer}
        >
          <Text style={styles.title}>P2PCF Mobile Example</Text>
          <Text style={styles.subtitle}>Desktop-Hub Star Topology</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Room ID</Text>
            <TextInput
              style={styles.input}
              value={roomId}
              onChangeText={setRoomId}
              placeholder="Enter room ID"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Client ID</Text>
            <TextInput
              style={styles.input}
              value={clientId}
              onChangeText={setClientId}
              placeholder="Your client ID"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleConnect}
          >
            <Text style={styles.connectButtonText}>Connect to Room</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>How it works:</Text>
            <Text style={styles.infoText}>
              1. Start a desktop peer first (isDesktop: true){'\n'}
              2. Configure this mobile app with the same room ID{'\n'}
              3. Mobile will automatically connect to desktop{'\n'}
              4. Send messages between mobile and desktop
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Chat view
  return (
    <View style={styles.container}>
      <View style={styles.chatContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>P2PCF Chat</Text>
            <Text style={styles.headerSubtitle}>{connectionStatus}</Text>
          </View>
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={handleDisconnect}
          >
            <Text style={styles.disconnectButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.fromSelf ? styles.messageSelf : styles.messageOther,
                message.text.startsWith('[SYSTEM]') && styles.messageSystem,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.fromSelf && styles.messageTextSelf,
                  message.text.startsWith('[SYSTEM]') &&
                    styles.messageTextSystem,
                ]}
              >
                {message.text}
              </Text>
              <Text
                style={[
                  styles.messageTime,
                  message.fromSelf && styles.messageTimeSelf,
                ]}
              >
                {new Date(message.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={
                isConnected ? 'Type a message...' : 'Waiting for desktop...'
              }
              editable={isConnected}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !isConnected && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!isConnected || !inputText.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  setupContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  connectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1976d2',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
  },
  chatContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
  },
  disconnectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  messageSelf: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  messageOther: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
  },
  messageSystem: {
    alignSelf: 'center',
    backgroundColor: '#e0e0e0',
    maxWidth: '90%',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  messageTextSelf: {
    color: 'white',
  },
  messageTextSystem: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  messageTimeSelf: {
    color: '#e0e0e0',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
