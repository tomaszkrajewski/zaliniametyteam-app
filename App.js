/**
 * KEYBOARD HANDLING PROOF-OF-CONCEPT
 *
 * Pattern: Manual keyboard height tracking (no KeyboardAvoidingView)
 *
 * Why this works reliably on both platforms:
 * - KeyboardAvoidingView has known bugs with behavior='height' on Android
 *   (layout doesn't restore after dismiss) and behavior='padding' miscalculates
 *   offsets when there are headers/status bars above it.
 * - With edgeToEdgeEnabled:true on Android, the system's adjustResize may not
 *   work, and changing softwareKeyboardLayoutMode globally affects ALL screens
 *   including modals.
 * - This pattern gives each component full control over its own keyboard
 *   avoidance without any global side effects.
 *
 * How it works:
 * 1. Listen to Keyboard events (keyboardWillShow on iOS, keyboardDidShow on Android)
 * 2. Store the keyboard height from event.endCoordinates.height
 * 3. Apply it as marginBottom on the input container
 * 4. The flex layout naturally shrinks the chat list to make room
 * 5. On keyboard hide, marginBottom goes back to 0 and layout fully restores
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    FlatList, Platform, Keyboard,
    StatusBar as RNStatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 45;

// Sample data for the PoC
const SAMPLE_MESSAGES = [
    { id: '1', text: 'Czesc! Jak trening?', side: 'left', time: '10:00' },
    { id: '2', text: 'Bylo super, 10km w 48min', side: 'right', time: '10:01' },
    { id: '3', text: 'Swietny wynik!', side: 'left', time: '10:02' },
    { id: '4', text: 'Dziekuje, nogi troche bolaly po wczorajszym', side: 'right', time: '10:03' },
    { id: '5', text: 'To normalne po interwalkach', side: 'left', time: '10:04' },
    { id: '6', text: 'Jutro odpoczynek', side: 'right', time: '10:05' },
    { id: '7', text: 'Tak, regeneracja jest wazna', side: 'left', time: '10:06' },
    { id: '8', text: 'W piatek tempo run 8km', side: 'left', time: '10:07' },
    { id: '9', text: 'OK, bede gotowy', side: 'right', time: '10:08' },
    { id: '10', text: 'Pamietaj o rozgrzewce!', side: 'left', time: '10:09' },
    { id: '11', text: 'Do tego klepanie z komputera mnie meczy, a przeciez mozna ladnie dyktowac', side: 'right', time: '10:10' },
];

const SAMPLE_PLAN = [
    { id: '1', title: 'Bieg poranny', date: '24-03-2026', details: '5km, luzne tempo' },
    { id: '2', title: 'Interwalki', date: '25-03-2026', details: '8x400m @ tempo 5K' },
    { id: '3', title: 'Odpoczynek', date: '26-03-2026', details: 'Aktywna regeneracja' },
    { id: '4', title: 'Tempo Run', date: '27-03-2026', details: '10km w tempie maratonskim' },
    { id: '5', title: 'Dlugi bieg', date: '28-03-2026', details: '18km, spokojne tempo' },
    { id: '6', title: 'Rozciaganie', date: '29-03-2026', details: 'Yoga 30 min' },
    { id: '7', title: 'Bieg regeneracyjny', date: '30-03-2026', details: '6km bardzo wolno' },
];

export default function App() {
    const [activeTab, setActiveTab] = useState('plan');
    const [messages, setMessages] = useState(SAMPLE_MESSAGES);
    const [newMessage, setNewMessage] = useState('');
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const chatListRef = useRef(null);

    useEffect(() => {
        // iOS: keyboardWillShow/Hide fires BEFORE animation starts (smooth)
        // Android: keyboardDid* fires AFTER animation completes (only reliable option)
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
            setIsKeyboardVisible(true);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
            setIsKeyboardVisible(false);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Scroll chat to end when keyboard appears
    useEffect(() => {
        if (isKeyboardVisible && activeTab === 'chat') {
            setTimeout(() => {
                chatListRef.current?.scrollToEnd({ animated: true });
            }, 300);
        }
    }, [isKeyboardVisible, activeTab]);

    const sendMessage = () => {
        if (!newMessage.trim()) return;
        const msg = {
            id: String(Date.now()),
            text: newMessage.trim(),
            side: 'right',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, msg]);
        setNewMessage('');
    };

    return (
        <View style={[styles.mainView, { paddingTop: STATUSBAR_HEIGHT }]}>
            <RNStatusBar barStyle="light-content" backgroundColor="#0f172a" />

            {/* HEADER */}
            <View style={styles.headerArea}>
                <Text style={styles.headerTitle}>
                    {activeTab === 'plan' ? 'Timeline' : 'Chat'}
                </Text>
                <Text style={styles.headerSubtitle}>Keyboard PoC</Text>
            </View>

            {/* CONTENT AREA - flex:1 takes all remaining space */}
            <View style={{ flex: 1 }}>
                {activeTab === 'plan' ? (
                    /* ===== PLAN TAB ===== */
                    <FlatList
                        data={SAMPLE_PLAN}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({ item }) => (
                            <View style={styles.card}>
                                <View style={styles.accent} />
                                <View style={styles.cardContent}>
                                    <Text style={styles.cardDate}>{item.date}</Text>
                                    <Text style={styles.cardTitle}>{item.title}</Text>
                                    <Text style={styles.cardDetails}>{item.details}</Text>
                                </View>
                            </View>
                        )}
                    />
                ) : (
                    /* ===== CHAT TAB =====
                       Key layout: flex column with
                       FlatList (flex:1) + InputWrapper (with dynamic marginBottom).
                       When keyboard shows, marginBottom pushes input up,
                       FlatList shrinks to fill remaining space.
                       When keyboard hides, marginBottom=0 and layout fully restores. */
                    <View style={{ flex: 1 }}>
                        <FlatList
                            ref={chatListRef}
                            data={messages}
                            keyExtractor={item => item.id}
                            style={{ flex: 1 }}
                            contentContainerStyle={{ padding: 15, paddingBottom: 10 }}
                            onContentSizeChange={() => {
                                chatListRef.current?.scrollToEnd({ animated: true });
                            }}
                            renderItem={({ item }) => (
                                <View style={[
                                    styles.msgContainer,
                                    item.side === 'right' ? styles.msgRight : styles.msgLeft
                                ]}>
                                    <Text style={styles.msgTime}>{item.time}</Text>
                                    <View style={[
                                        styles.msgBubble,
                                        item.side === 'right' ? styles.bubbleRight : styles.bubbleLeft
                                    ]}>
                                        <Text style={styles.msgText}>{item.text}</Text>
                                    </View>
                                </View>
                            )}
                        />

                        {/* INPUT BAR with dynamic marginBottom for keyboard.
                            marginBottom = keyboardHeight pushes this view up.
                            The FlatList above (flex:1) shrinks accordingly.
                            No KeyboardAvoidingView needed. */}
                        <View style={[
                            styles.inputWrapper,
                            { marginBottom: keyboardHeight }
                        ]}>
                            <TextInput
                                style={styles.chatInput}
                                placeholder="Message..."
                                placeholderTextColor="#64748b"
                                multiline
                                value={newMessage}
                                onChangeText={setNewMessage}
                            />
                            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                                <Ionicons name="send" size={18} color="#0f172a" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>

            {/* BOTTOM NAV - conditionally rendered (unmounted when keyboard visible).
                This avoids the display:'none' bug where the element stays in layout. */}
            {!isKeyboardVisible && (
                <View style={styles.bottomNavContainer}>
                    <View style={styles.tabBar}>
                        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('plan')}>
                            <Ionicons
                                name={activeTab === 'plan' ? "calendar" : "calendar-outline"}
                                size={26}
                                color={activeTab === 'plan' ? '#38bdf8' : '#94a3b8'}
                            />
                            <Text style={[styles.tabLabel, activeTab === 'plan' && styles.tabLabelActive]}>Plan</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('chat')}>
                            <Ionicons
                                name={activeTab === 'chat' ? "chatbubbles" : "chatbubbles-outline"}
                                size={26}
                                color={activeTab === 'chat' ? '#38bdf8' : '#94a3b8'}
                            />
                            <Text style={[styles.tabLabel, activeTab === 'chat' && styles.tabLabelActive]}>Chat</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.androidBuffer} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    mainView: { flex: 1, backgroundColor: '#0f172a' },

    headerArea: {
        paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15,
        backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b',
    },
    headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
    headerSubtitle: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 2 },

    card: {
        backgroundColor: '#1e293b', marginHorizontal: 15, marginTop: 12,
        borderRadius: 15, flexDirection: 'row', overflow: 'hidden',
    },
    accent: { width: 5, backgroundColor: '#38bdf8' },
    cardContent: { padding: 16, flex: 1 },
    cardDate: { color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
    cardTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
    cardDetails: { color: '#94a3b8', fontSize: 13, marginTop: 6, lineHeight: 18 },

    msgContainer: { marginBottom: 15, maxWidth: '85%' },
    msgLeft: { alignSelf: 'flex-start' },
    msgRight: { alignSelf: 'flex-end' },
    msgBubble: { padding: 12, borderRadius: 18 },
    bubbleLeft: { backgroundColor: '#1e293b', borderTopLeftRadius: 4 },
    bubbleRight: { backgroundColor: '#334155', borderTopRightRadius: 4 },
    msgText: { color: '#f1f5f9', fontSize: 14, lineHeight: 20 },
    msgTime: { color: '#64748b', fontSize: 10, marginBottom: 4 },

    inputWrapper: {
        flexDirection: 'row', alignItems: 'center', padding: 12,
        backgroundColor: '#1e293b', borderTopWidth: 1, borderColor: '#334155',
    },
    chatInput: {
        flex: 1, backgroundColor: '#0f172a', color: '#fff',
        paddingHorizontal: 15, borderRadius: 20, maxHeight: 100,
        fontSize: 15, paddingVertical: 8, marginRight: 10,
    },
    sendBtn: {
        backgroundColor: '#38bdf8', width: 40, height: 40,
        borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    },

    bottomNavContainer: { backgroundColor: '#1e293b', borderTopWidth: 1, borderColor: '#334155' },
    tabBar: {
        flexDirection: 'row', height: 65, justifyContent: 'space-around',
        alignItems: 'center', paddingTop: 5, paddingBottom: 5,
    },
    androidBuffer: { height: Platform.OS === 'android' ? 40 : 20, backgroundColor: '#1e293b' },
    tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    tabLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '700', marginTop: 4 },
    tabLabelActive: { color: '#38bdf8' },
});
