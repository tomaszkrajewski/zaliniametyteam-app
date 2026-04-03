import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    FlatList, ActivityIndicator, Alert, RefreshControl,
    StatusBar as RNStatusBar, Platform, Keyboard, Image
} from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import {Ionicons} from '@expo/vector-icons';

// KRYTYCZNY IMPORT: SafeAreaProvider i Hook do mierzenia paska systemowego
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import TrainingModal from './TrainingModal';

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? RNStatusBar.currentHeight : 45;

// GŁÓWNY KOMPONENT: Owija apkę w Provider dostarczający wymiary bezpiecznych stref
export default function App() {
    return (
        <SafeAreaProvider>
            <AppContent />
        </SafeAreaProvider>
    );
}

// CAŁA LOGIKA APLIKACJI
function AppContent() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('plan');
    const [timeline, setTimeline] = useState([]);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [userId, setUserId] = useState(null);
    const [daysToRace, setDaysToRace] = useState(null);
    const [lastUpdated, setLastUpdated] = useState('');

    // WZORZEC Z PoC: Śledzenie widoczności i DOKŁADNEJ wysokości klawiatury
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

    const [allRawEvents, setAllRawEvents] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);

    const chatListRef = useRef(null);
    const flatListRef = useRef(null);
    const [initialScrollDone, setInitialScrollDone] = useState(false);

    const insets = useSafeAreaInsets(); // Zczytywanie dolnego paska gestów/przycisków Androida

    const ID_TRENER = 1;
    const FLAG = 1;

    const getTodayString = () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        return `${d}-${m}-${y}`;
    };
    const todayDateStr = getTodayString();

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            // Bezpieczna matematyka: Wysokość klawiatury MINUS dolny pasek systemowy
            const actualHeight = Platform.OS === 'android' ? Math.max(0, e.endCoordinates.height + 50) : e.endCoordinates.height;
            setKeyboardHeight(actualHeight);
            setIsKeyboardVisible(true);
        });

        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
            setIsKeyboardVisible(false);
        });

        const initApp = async () => {
            const u = await SecureStore.getItemAsync('uEmail');
            const p = await SecureStore.getItemAsync('uPass');
            if (u && p) {
                setEmail(u);
                setPassword(p);
                await handleLogin(u, p, false);
            } else {
                setLoading(false);
            }
        };
        initApp();

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [insets.bottom]); // Reaguje na ewentualne zmiany bezpiecznych stref

    // === GWARANTOWANY SCROLL DO DOŁU ===
    const scrollToBottom = (animated = true) => {
        if (chatListRef.current && messages.length > 0) {
            setTimeout(() => {
                try {
                    chatListRef.current.scrollToEnd({animated});
                } catch (e) {}
            }, 150);
        }
    };

    // Obsługa zmiany zakładki na chat
    useEffect(() => {
        if (activeTab === 'chat' && messages.length > 0) {
            scrollToBottom(false); // false = bez animacji, użytkownik wchodzi i od razu widzi dół
        }
    }, [activeTab, messages.length]);

    const scrollToToday = () => {
        const idx = timeline.findIndex(item => item.data === todayDateStr);
        if (idx !== -1 && flatListRef.current) {
            try {
                flatListRef.current.scrollToIndex({
                    index: idx,
                    animated: true,
                    viewPosition: 0.5
                });
            } catch (error) {
                console.log("Scroll to index failed, handled safely.", error);
            }
        }
    };

    const getApi = () => axios.create({
        baseURL: 'https://planbieganie.pl',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest'},
        withCredentials: true
    });

    const handleLogin = async (u = email, p = password, isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const api = getApi();
            const loginRes = await api.post('/zaliniamety/login', `username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`);
            const idMatch = loginRes.data.match(/id="session_id"[^>]+value="(\d+)"/);
            const zawodnikId = idMatch ? idMatch[1] : null;

            if (!zawodnikId) throw new Error("Auth Failed");
            setUserId(zawodnikId);
            await SecureStore.setItemAsync('uEmail', u);
            await SecureStore.setItemAsync('uPass', p);

            const planRes = await api.post('/zaliniamety/files/treningi.php', `zawodnik=${zawodnikId}`);
            processTimeline(planRes.data);

            const dashRes = await api.get('/zaliniamety/');
            parseMessages(dashRes.data);

            const now = new Date();
            setLastUpdated(`${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
            setIsLoggedIn(true);
        } catch (err) {
            if (!isSilent) Alert.alert("Error", "Login failed.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert("Logout", "Confirm log out?", [
            {text: "Cancel", style: "cancel"},
            {
                text: "Log Out", style: "destructive", onPress: async () => {
                    await SecureStore.deleteItemAsync('uEmail');
                    await SecureStore.deleteItemAsync('uPass');
                    setIsLoggedIn(false);
                    setUserId(null);
                }
            }
        ]);
    };

    const parseMessages = (html) => {
        const msgArray = [];
        const blocks = html.split(/<div class="chat-content-(leftside|rightside)">/g);
        for (let i = 1; i < blocks.length; i += 2) {
            const side = blocks[i];
            const content = blocks[i + 1];
            const timeMatch = content.match(/class="mb-0 chat-time[^>]*>(.*?)<\/p>/);
            const textMatch = content.match(/class="chat-(left|right)-msg">(.*?)<\/p>/s);
            if (timeMatch && textMatch) {
                const rawTime = timeMatch[1].replace(/<[^>]*>/g, '').trim();
                const dMatch = rawTime.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
                let sortKey = 0;
                if (dMatch) {
                    const [_, d, m, y, hh, mm, ss] = dMatch;
                    sortKey = parseInt(`${y}${m}${d}${hh}${mm}${ss}`);
                }
                msgArray.push({
                    side,
                    senderInfo: rawTime,
                    text: textMatch[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim(),
                    sortKey
                });
            }
        }
        const sorted = msgArray.sort((a, b) => a.sortKey - b.sortKey);
        setMessages(sorted.slice(-15));
    };

    const processTimeline = (data) => {
        const safeData = Array.isArray(data) ? data : [];
        setAllRawEvents(safeData);

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const startRange = new Date(now);
        startRange.setDate(now.getDate() - 10);
        const endRange = new Date(now);
        endRange.setMonth(now.getMonth() + 3);

        const filtered = safeData.filter(t => {
            if ((t.rodzaj !== "trening" && t.rodzaj !== "start") || !t.data) return false;
            const [d, m, y] = t.data.split('-').map(Number);
            const itemDate = new Date(y, m - 1, d);
            return itemDate >= startRange && itemDate <= endRange;
        });

        for (let i = 0; i <= 10; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

            if (!filtered.find(e => e.data === dateStr)) {
                filtered.push({data: dateStr, rodzaj: 'past_garmin'});
            }
        }

        filtered.sort((a, b) => a.data.split('-').reverse().join('').localeCompare(b.data.split('-').reverse().join('')));

        const upcomingRaces = filtered.filter(item => {
            if (item.rodzaj !== 'start') return false;
            const [d, m, y] = item.data.split('-').map(Number);
            const raceDate = new Date(y, m - 1, d);
            return raceDate >= now;
        });

        if (upcomingRaces.length > 0) {
            const nextRace = upcomingRaces[0];
            const [rd, rm, ry] = nextRace.data.split('-').map(Number);
            const diff = Math.ceil((new Date(ry, rm - 1, rd) - now) / (1000 * 60 * 60 * 24));
            setDaysToRace(diff);
        } else {
            setDaysToRace(null);
        }

        setTimeline(filtered);
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !userId) return;
        try {
            const api = getApi();
            const params = new URLSearchParams({
                id_zawodnik: userId,
                id_trener: ID_TRENER,
                tekst: newMessage.replace(/\n/g, '<br />'),
                flaga: FLAG
            });
            setNewMessage('');
            const res = await api.post('/zaliniamety/files/dodajChat.php', params.toString());
            if (res.data) parseMessages(res.data);
            scrollToBottom(true);
        } catch (err) {
            Alert.alert("Error", "Message not sent.");
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        handleLogin(email, password, true);
    }, [email, password]);

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#38bdf8"/></View>;

    if (!isLoggedIn) {
        return (
            <View style={[styles.authView, {paddingTop: STATUSBAR_HEIGHT}]}>

                <Image source={require('./assets/icon.png')} style={styles.loginLogo}/>

                <Text style={styles.heroSubtitle}>treningi & dziennik</Text>

                <TextInput style={styles.input} placeholder="User" value={email} onChangeText={setEmail}
                           placeholderTextColor="#475569" autoCapitalize="none"/>
                <TextInput style={styles.input} placeholder="Pass" value={password} onChangeText={setPassword}
                           secureTextEntry placeholderTextColor="#475569"/>
                <TouchableOpacity style={styles.loginBtn} onPress={() => handleLogin()}><Text
                    style={styles.loginBtnText}>Login</Text></TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.mainView, {paddingTop: STATUSBAR_HEIGHT}]}>
            <RNStatusBar barStyle="light-content" backgroundColor="#0f172a"/>

            <View style={styles.headerArea}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerSide}>
                        {activeTab === 'plan' && (
                            <TouchableOpacity onPress={scrollToToday} style={styles.ghostBtn}>
                                <Ionicons name="calendar-outline" size={26} color="#38bdf8"/>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.headerCenter}>
                        <Image
                            source={require('./assets/icon.png')}
                            style={styles.headerLogoCentered}
                        />
                    </View>

                    <View style={[styles.headerSide, {alignItems: 'flex-end'}]}>
                        <TouchableOpacity onPress={handleLogout} style={styles.ghostBtn}>
                            <Ionicons name="log-out-outline" size={28} color="#f87171"/>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.headerBottomRow}>
                    <Text style={styles.hugeTitle}>
                        {activeTab === 'plan' ? 'Timeline' : 'Chat'}
                    </Text>

                    <View style={styles.badgesContainer}>
                        {daysToRace !== null && (
                            <View style={styles.badgeRace}>
                                <Text style={styles.raceCountdown}>🏆 {daysToRace}d</Text>
                            </View>
                        )}
                        <View style={styles.badgeUpdate}>
                            <Ionicons name="sync" size={12} color="#94a3b8" style={{marginRight: 4}}/>
                            <Text style={styles.lastUpdated}>{lastUpdated}</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* USUNIĘTY KLAWIATUROWY WRAPPER! Wymieniony na bezpieczne View z Flexboxem */}
            <View style={{flex: 1}}>
                {activeTab === 'plan' ? (
                    <FlatList
                        ref={flatListRef}
                        data={timeline}
                        keyExtractor={(_, idx) => idx.toString()}
                        contentContainerStyle={{paddingBottom: 20}}
                        initialNumToRender={150}
                        onScrollToIndexFailed={(info) => {
                            const wait = new Promise(resolve => setTimeout(resolve, 500));
                            wait.then(() => {
                                if (flatListRef.current) {
                                    try {
                                        flatListRef.current.scrollToIndex({
                                            index: info.index,
                                            animated: true,
                                            viewPosition: 0.5
                                        });
                                    } catch (e) {
                                    }
                                }
                            });
                        }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
                                                        tintColor="#38bdf8" colors={["#38bdf8"]}
                                                        progressViewOffset={20}/>}
                        renderItem={({item}) => {
                            const isRace = item.rodzaj === "start";
                            const isPlan = item.rodzaj === "trening";
                            const isToday = item.data === todayDateStr;

                            const garminForDay = allRawEvents.filter(e => e.data === item.data && e.rodzaj === 'garmin');
                            const decodedGarmin = garminForDay.map(g => {
                                let sum = {};
                                try {
                                    sum = g.summary ? JSON.parse(g.summary) : {};
                                } catch (e) {
                                }
                                return {...g, summaryObj: sum};
                            });

                            const runs = decodedGarmin.filter(g => g.summaryObj.activityType === 'RUNNING');
                            const others = decodedGarmin.filter(g => g.summaryObj.activityType && g.summaryObj.activityType !== 'RUNNING');

                            if (item.rodzaj === 'past_garmin' && decodedGarmin.length === 0) return null;

                            const isOtherOnly = !isPlan && !isRace && runs.length === 0 && others.length > 0;

                            let title = "";
                            let details = "";

                            if (isOtherOnly) {
                                title = others.map(o => (o.summaryObj.activityName || o.summaryObj.activityType).toUpperCase()).join(" + ");
                                details = others.map(o => {
                                    const typeFormatted = o.summaryObj.activityType.replace(/_/g, ' ');
                                    const time = Math.round((o.summaryObj.durationInSeconds || 0) / 60);
                                    return `${typeFormatted} (${time} min)`;
                                }).join("  •  ");
                            } else {
                                title = isRace ? item.nazwa_start : (item.nazwa_trening || 'Trening biegowy');

                                if (!title && item.rodzaj === 'past_garmin' && runs.length > 0) {
                                    title = (runs[0].summaryObj.activityName || 'Niezaplanowany bieg').toUpperCase();
                                }

                                const fallbackDesc = item.opis || item.opis_treningu || '';
                                const rawDesc = (runs.length > 0 && runs[0].opis) ? runs[0].opis : fallbackDesc;
                                details = rawDesc ? rawDesc.replace(/<[^>]*>?/gm, '').trim() : '';

                                if (others.length > 0) {
                                    const othersDetails = others.map(o => `${o.summaryObj.activityType.replace(/_/g, ' ')} (${Math.round((o.summaryObj.durationInSeconds || 0) / 60)}m)`).join(", ");
                                    details = details ? `${details}\n+ ${othersDetails}` : `+ ${othersDetails}`;
                                }
                            }

                            return (
                                <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedDate(item.data)}>
                                    <View style={[
                                        styles.card,
                                        isRace && styles.raceCard,
                                        isToday && !isRace && styles.todayCard,
                                        isOtherOnly && {borderColor: '#3730a3', borderWidth: 1}
                                    ]}>
                                        <View style={[
                                            styles.accent,
                                            isRace && styles.raceAccent,
                                            isToday && !isRace && styles.todayAccent,
                                            isOtherOnly && {backgroundColor: '#818cf8'}
                                        ]}/>
                                        <View style={styles.cardContent}>
                                            <Text style={[
                                                styles.cardDate,
                                                isRace && styles.raceDate,
                                                isToday && !isRace && styles.todayDate,
                                                isOtherOnly && {color: '#818cf8'}
                                            ]}>
                                                {isToday ? `DZIŚ • ${item.data}` : item.data}
                                            </Text>
                                            <Text style={[styles.cardTitle, isRace && styles.raceTitle]}>
                                                {title}
                                            </Text>
                                            {details ? (
                                                <Text style={styles.cardDetails}>{details}</Text>
                                            ) : null}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                ) : (
                    <View style={{flex: 1}}>
                        <FlatList
                            ref={chatListRef}
                            data={messages}
                            keyExtractor={(_, idx) => idx.toString()}
                            style={{flex: 1}}
                            contentContainerStyle={{padding: 15, paddingBottom: 10}}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
                                                            tintColor="#38bdf8" colors={["#38bdf8"]}/>}

                            onContentSizeChange={() => scrollToBottom(true)}
                            onLayout={() => scrollToBottom(false)}

                            renderItem={({item}) => (
                                <View
                                    style={[styles.msgContainer, item.side === 'rightside' ? styles.msgRight : styles.msgLeft]}>
                                    <Text style={styles.msgTime}>{item.senderInfo}</Text>
                                    <View
                                        style={[styles.msgBubble, item.side === 'rightside' ? styles.bubbleRight : styles.bubbleLeft]}>
                                        <Text style={styles.msgText}>{item.text}</Text>
                                    </View>
                                </View>
                            )}
                        />
                        {/* WZORZEC PoC: Margines odpychający czat idealnie o wysokość klawiatury */}
                        <View style={[styles.inputWrapper, { marginBottom: keyboardHeight }]}>
                            <TextInput
                                style={styles.chatInput}
                                placeholder="Message..."
                                placeholderTextColor="#64748b"
                                multiline
                                value={newMessage}
                                onChangeText={setNewMessage}
                                // onFocus usunięty by zapobiec podwójnemu i szarpanemu scrollowaniu
                            />
                            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                                <Ionicons name="send" size={18} color="#0f172a"/>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>

            {/* Menu znika natychmiast, pozwalając klawiaturze zająć to samo miejsce */}
            {!isKeyboardVisible && (
                <View style={styles.bottomNavContainer}>
                    <View style={styles.tabBar}>
                        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('plan')}>
                            <Ionicons name={activeTab === 'plan' ? "calendar" : "calendar-outline"} size={26}
                                      color={activeTab === 'plan' ? '#38bdf8' : '#94a3b8'}/>
                            <Text
                                style={[styles.tabLabel, activeTab === 'plan' && styles.tabLabelActive]}>Plan</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('chat')}>
                            <Ionicons name={activeTab === 'chat' ? "chatbubbles" : "chatbubbles-outline"} size={26}
                                      color={activeTab === 'chat' ? '#38bdf8' : '#94a3b8'}/>
                            <Text
                                style={[styles.tabLabel, activeTab === 'chat' && styles.tabLabelActive]}>Chat</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.androidBuffer}/>
                </View>
            )}

            <TrainingModal
                visible={!!selectedDate}
                date={selectedDate}
                events={allRawEvents.filter(e => e.data === selectedDate)}
                onClose={() => setSelectedDate(null)}
                onRefresh={onRefresh}
            />

        </View>
    );
}

const styles = StyleSheet.create({
    center: {flex: 1, backgroundColor: '#0f172a', justifyContent: 'center'},
    authView: {flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 30},

    loginLogo: {
        width: 250,
        height: 70,
        resizeMode: 'contain',
        alignSelf: 'center',
        marginBottom: 10
    },
    heroSubtitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 40
    },

    input: {
        backgroundColor: '#1e293b',
        color: '#fff',
        padding: 18,
        borderRadius: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#334155'
    },
    loginBtn: {backgroundColor: '#38bdf8', padding: 20, borderRadius: 20, alignItems: 'center'},
    loginBtnText: {color: '#0f172a', fontWeight: '800', fontSize: 16},

    mainView: {flex: 1, backgroundColor: '#0f172a'},

    headerArea: {
        paddingHorizontal: 20,
        paddingTop: 5,
        paddingBottom: 15,
        backgroundColor: '#0f172a',
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b'
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 15
    },
    headerSide: {
        flex: 1,
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerLogoCentered: {
        width: 38,
        height: 38,
        resizeMode: 'contain',
    },
    ghostBtn: {
        padding: 5,
    },
    headerBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    hugeTitle: {
        color: '#f8fafc',
        fontSize: 34,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    badgesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    badgeUpdate: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10
    },
    badgeRace: {
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.2)'
    },
    lastUpdated: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '700'
    },
    raceCountdown: {
        color: '#fbbf24',
        fontSize: 11,
        fontWeight: '800'
    },
    logoutBtn: {padding: 5},

    card: {
        backgroundColor: '#1e293b',
        marginHorizontal: 15,
        marginTop: 12,
        borderRadius: 15,
        flexDirection: 'row',
        overflow: 'hidden'
    },

    todayCard: {borderColor: '#10b981', borderWidth: 1, backgroundColor: '#064e3b'},
    todayAccent: {backgroundColor: '#10b981'},
    todayDate: {color: '#10b981', fontWeight: '900'},

    raceCard: {backgroundColor: '#2d2613', borderColor: '#fbbf24', borderWidth: 1},
    accent: {width: 5, backgroundColor: '#38bdf8'},
    raceAccent: {backgroundColor: '#fbbf24'},
    cardContent: {padding: 16, flex: 1},
    cardDate: {color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase'},
    cardTitle: {color: '#f8fafc', fontSize: 16, fontWeight: '700'},

    cardDetails: {color: '#94a3b8', fontSize: 13, marginTop: 6, lineHeight: 18},

    msgContainer: {marginBottom: 15, maxWidth: '85%'},
    msgLeft: {alignSelf: 'flex-start'},
    msgRight: {alignSelf: 'flex-end'},
    msgBubble: {padding: 12, borderRadius: 18},
    bubbleLeft: {backgroundColor: '#1e293b', borderTopLeftRadius: 4},
    bubbleRight: {backgroundColor: '#334155', borderTopRightRadius: 4},
    msgText: {color: '#f1f5f9', fontSize: 14, lineHeight: 20},
    msgTime: {color: '#64748b', fontSize: 10, marginBottom: 4},

    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#1e293b',
        borderTopWidth: 1,
        borderColor: '#334155'
    },
    chatInput: {
        flex: 1,
        backgroundColor: '#0f172a',
        color: '#fff',
        paddingHorizontal: 15,
        borderRadius: 20,
        maxHeight: 100,
        fontSize: 15,
        paddingVertical: 8,
        marginRight: 10
    },
    sendBtn: {
        backgroundColor: '#38bdf8',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center'
    },

    bottomNavContainer: {backgroundColor: '#1e293b', borderTopWidth: 1, borderColor: '#334155'},
    tabBar: {
        flexDirection: 'row',
        height: 65,
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 5,
        paddingBottom: 5
    },
    androidBuffer: {height: Platform.OS === 'android' ? 40 : 20, backgroundColor: '#1e293b'},
    tabItem: {alignItems: 'center', justifyContent: 'center', flex: 1},
    tabLabel: {fontSize: 10, color: '#94a3b8', fontWeight: '700', marginTop: 4},
    tabLabelActive: {color: '#38bdf8'},
    headerLogo: {
        width: 140,
        height: 35,
        resizeMode: 'contain',
    },
});