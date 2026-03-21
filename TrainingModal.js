import React, { useState, useEffect } from 'react';
import {
    Modal, View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Linking
} from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';

const FATIGUE_OPTIONS = [
    { value: '0', label: 'Małe' },
    { value: '1', label: 'Średnie' },
    { value: '2', label: 'Duże' },
    { value: '3', label: 'Zgon' },
    { value: '4', label: 'DNF' },
];

// --- INTELIGENTNY KOMPONENT IKON SPORTOWYCH ---
const SportIcon = ({ activityType, activityName, size = 15, color }) => {
    const type = (activityType || '').toUpperCase();
    const name = (activityName || '').toUpperCase();

    if (type.includes('RUN') || name.includes('BIEG'))
        return <MaterialCommunityIcons name="shoe-sneaker" size={size + 2} color={color} />;
    if (type.includes('SWIM') || name.includes('PŁYW'))
        return <FontAwesome5 name="swimmer" size={size - 1} color={color} />;
    if (type.includes('YOGA') || type.includes('PILATES') || type.includes('FLEXIBILITY') || name.includes('JOGA') || name.includes('ROZCIĄGANIE'))
        return <MaterialCommunityIcons name="yoga" size={size + 1} color={color} />;
    if (type.includes('STRENGTH') || name.includes('SIŁA') || name.includes('TRENING SIŁOWY'))
        return <MaterialCommunityIcons name="dumbbell" size={size} color={color} />;
    if (type.includes('INDOOR_CYCLING') || name.includes('STACJONARNY') || name.includes('TAX'))
        return <MaterialCommunityIcons name="bike-fast" size={size + 1} color={color} />;
    if (type.includes('CYCLING') || name.includes('ROWER'))
        return <Ionicons name="bicycle-outline" size={size} color={color} />;

    return <Ionicons name="fitness-outline" size={size} color={color} />;
};

export default function TrainingModal({ visible, date, events, onClose, onRefresh }) {
    const [text, setText] = useState('');
    const [zmeczenie, setZmeczenie] = useState('0');
    const [loading, setLoading] = useState(false);
    const [lapsCollapsed, setLapsCollapsed] = useState(false);

    const treningEvent = events.find(e => e.rodzaj === 'trening');

    const allGarminEvents = events
        .filter(e => e.rodzaj === 'garmin')
.map(e => {
        let parsedSummary = {};
    let parsedLaps = [];
    try { parsedSummary = e.summary ? JSON.parse(e.summary) : {}; } catch (err) {}
    try { parsedLaps = e.laps ? JSON.parse(e.laps) : []; } catch (err) {}
    return { ...e, summaryObj: parsedSummary, lapsArr: parsedLaps };
});

    const garminEvents = allGarminEvents.filter(e => e.summaryObj.activityType === 'RUNNING');
    const otherGarminEvents = allGarminEvents.filter(e => e.summaryObj.activityType !== 'RUNNING');

    const firstGarmin = garminEvents[0] || otherGarminEvents[0];
    const garminDescription = firstGarmin?.opis || firstGarmin?.summaryObj?.activityName;
    const subtitleText = garminDescription || (treningEvent ? treningEvent.nazwa_trening : 'Trening');

    const showFeedback = treningEvent && (garminEvents.length > 0 || otherGarminEvents.length === 0);

    useEffect(() => {
        if (treningEvent && visible) {
        setText(treningEvent.opis_zawodnik || '');
        setZmeczenie(treningEvent.cel || '0');
    }
}, [treningEvent, visible]);

    // --- FUNKCJA DEEP-LINKING DO GARMINA ---
    const openGarminConnect = async (activityId) => {
        if (!activityId) return;

        const appUrl = `garminconnect://activity/${activityId}`;
        const webUrl = `https://connect.garmin.com/modern/activity/${activityId}`;

        try {
            const supported = await Linking.canOpenURL(appUrl);
            if (supported) {
                await Linking.openURL(appUrl);
            } else {
                await Linking.openURL(webUrl);
            }
        } catch (error) {
            Alert.alert("Błąd", "Nie udało się otworzyć aktywności.");
        }
    };

    const cleanCoachDesc = (html) => {
        if (!html) return 'Brak opisu treningu.';
        return html.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, '').trim();
    };

    const formatDistanceMeters = (meters) => {
        const m = parseFloat(meters);
        return isNaN(m) ? "0.00" : (m / 1000).toFixed(2);
    };

    const formatDistanceKm = (km) => {
        const k = parseFloat(km);
        return isNaN(k) ? "0.00" : k.toFixed(2);
    };

    const formatTimeSeconds = (totalSeconds) => {
        const s = parseInt(totalSeconds);
        if (isNaN(s) || s === 0) return "--:--";
        const hours = Math.floor(s / 3600);
        const minutes = Math.floor((s % 3600) / 60);
        const seconds = s % 60;
        let res = hours > 0 ? `${hours}:` : "";
        res += `${minutes < 10 && hours > 0 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        return res;
    };

    const formatCalculatedPace = (totalSeconds, meters) => {
        const s = parseFloat(totalSeconds);
        const m = parseFloat(meters);
        if (!m || !s || m === 0) return "--:--";
        const minutesPerKm = (s / 60) / (m / 1000);
        const mins = Math.floor(minutesPerKm);
        const secs = Math.round((minutesPerKm - mins) * 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const formatDirectPaceSeconds = (paceInSeconds) => {
        const s = parseInt(paceInSeconds);
        if (isNaN(s) || s === 0) return "--:--";
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const submitFeedback = async () => {
        if (!treningEvent?.id_treningu) return;
        setLoading(true);
        try {
            const api = axios.create({
                baseURL: 'https://planbieganie.pl',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
                withCredentials: true
            });
            const params = new URLSearchParams({ id: treningEvent.id_treningu, text: text, zmeczenie: zmeczenie, kilometry: "0" });
            await api.post('/zaliniamety/files/dodajOpisZawodnik.php', params.toString());
            Alert.alert("Sukces", "Trening zapisany!");
            onRefresh();
            onClose();
        } catch (err) {
            Alert.alert("Błąd", "Nie udało się zapisać.");
        } finally {
            setLoading(false);
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalContent}>

        <View style={styles.headerArea}>
        <View style={styles.headerTextContainer}>
        <Text style={styles.headerTitle}>{date}</Text>
        <View style={styles.headerSubRow}>
        <Text style={styles.lastUpdated} numberOfLines={1} ellipsizeMode="tail">
                  • {subtitleText}
</Text>
    </View>
    </View>
    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <Ionicons name="close" size={24} color="#94a3b8" />
        </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {/* PLAN TRENERA */}
    {treningEvent && (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}><Ionicons name="calendar" size={14} /> PLAN</Text>
    <View style={styles.infoBox}>
        <Text style={styles.infoText}>{cleanCoachDesc(treningEvent.opis)}</Text>
    </View>
    </View>
    )}

    {/* BIEGANIE (GŁÓWNA ANALIZA) */}
    {garminEvents.map((garmin, idx) => {
        const summary = garmin.summaryObj;
        const laps = garmin.lapsArr;
        const actName = summary.activityName || 'Bieganie';
        const actType = summary.activityType;

        const gDist = summary.distanceInMeters || 0;
        const gTime = summary.durationInSeconds || 0;

        const hr = summary.averageHeartRateInBeatsPerMinute || '--';
        const maxHr = summary.maxHeartRateInBeatsPerMinute || '--';
        const cadence = summary.averageRunCadenceInStepsPerMinute ? Math.round(summary.averageRunCadenceInStepsPerMinute) : '--';
        const elevationGain = summary.totalElevationGainInMeters || '--';
        const elevationLoss = summary.totalElevationLossInMeters || '--';

        return (
            <View key={`run-${idx}`} style={styles.garminSection}>
        <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>
    <SportIcon activityType={actType} activityName={actName} size={15} color="#38bdf8" />
        {' '} ANALIZA BIEGU
    </Text>

        {/* LINK DO GARMIN CONNECT (Szary kolor dla kontrastu z nagłówkiem) */}
    <TouchableOpacity
        style={styles.garminLinkBtn}
        onPress={() => openGarminConnect(summary.activityId)}
    >
    <Text style={styles.garminLinkText}>GARMIN CONNECT</Text>
    <Ionicons name="open-outline" size={14} color="#94a3b8" />
        </TouchableOpacity>

        <View style={[styles.unifiedCard, { borderColor: '#38bdf8' }]}>
    <View style={styles.unifiedStatCol}>
        <Text style={styles.unifiedStatLabel}>DYSTANS</Text>
        <Text style={styles.unifiedStatValue}>
    {gDist > 0 ? formatDistanceMeters(gDist) : '--'}
        {gDist > 0 && <Text style={styles.unifiedStatUnit}> km</Text>}
            </Text>
            </View>
            <View style={styles.unifiedStatDivider} />
        <View style={styles.unifiedStatCol}>
            <Text style={styles.unifiedStatLabel}>CZAS</Text>
            <Text style={styles.unifiedStatValue}>{formatTimeSeconds(gTime)}</Text>
            </View>
            <View style={styles.unifiedStatDivider} />
        <View style={styles.unifiedStatCol}>
            <Text style={styles.unifiedStatLabel}>ŚR / MAX HR</Text>
        <Text style={styles.unifiedStatValue}>
            {hr}/{maxHr}
        </Text>
        </View>
        </View>

        <View style={styles.paramsTable}>
            <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Średnie Tempo</Text>
        <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{formatCalculatedPace(gTime, gDist)} <Text style={styles.paramUnit}>/km</Text></Text>
        </View>
        <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Średnia Kadencja</Text>
        <Text style={styles.paramValue}>{cadence} <Text style={styles.paramUnit}>spm</Text></Text>
        </View>
        <View style={[styles.paramRow, { borderBottomWidth: 0 }]}>
        <Text style={styles.paramLabel}>Up / Down</Text>
            <Text style={styles.paramValue}>{elevationGain} / {elevationLoss}  <Text style={styles.paramUnit}>m</Text></Text>
        </View>
        </View>

            {laps.length > 0 && (
            <View style={styles.lapsContainer}>
                <TouchableOpacity
                style={styles.lapsHeaderTitleRow}
                onPress={() => setLapsCollapsed(!lapsCollapsed)}
                activeOpacity={0.8}
                    >
                    <Text style={styles.lapsTitle}>ODCINKI</Text>
                <Ionicons
                name={lapsCollapsed ? "chevron-forward" : "chevron-down"}
                size={14}
                color="#64748b"
                    />
                    </TouchableOpacity>

                {!lapsCollapsed && (
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderText, styles.colL]}>L</Text>
                <Text style={[styles.tableHeaderText, styles.colDyst]}>DYSTANS</Text>
                <Text style={[styles.tableHeaderText, styles.colCzas]}>CZAS</Text>
                <Text style={[styles.tableHeaderText, styles.colPace]}>TEMPO</Text>
                <Text style={[styles.tableHeaderText, styles.colHr]}>ŚR.HR</Text>
                <Text style={[styles.tableHeaderText, styles.colMaxHr]}>MAX.HR</Text>
                <Text style={[styles.tableHeaderText, styles.colKad]}>KAD.</Text>
                <Text style={[styles.tableHeaderText, styles.colKrok]}>KROK</Text>
                </View>

                    {laps.map((lap, lIdx) => (
                    <View key={lIdx} style={[styles.tableRow, lIdx % 2 !== 0 ? styles.rowOdd : styles.rowEven]}>
                    <Text style={[styles.tableCell, styles.colL, { color: '#64748b' }]}>{lap.numer}</Text>
                    <Text style={[styles.tableCell, styles.colDyst]}>{formatDistanceKm(lap.dystans)} km</Text>
                    <Text style={[styles.tableCell, styles.colCzas]}>{formatTimeSeconds(lap.czas)}</Text>
                    <Text style={[styles.tableCell, styles.colPace, { color: '#38bdf8' }]}>{formatDirectPaceSeconds(lap.tempo)}</Text>
                    <Text style={[styles.tableCell, styles.colHr]}>{lap.tetno || '--'}</Text>
                    <Text style={[styles.tableCell, styles.colMaxHr]}>{lap.tetno_max || '--'}</Text>
                    <Text style={[styles.tableCell, styles.colKad]}>{lap.kadencja || '--'}</Text>
                    <Text style={[styles.tableCell, styles.colKrok]}>{lap.krok ? parseFloat(lap.krok).toFixed(2) : '--'}</Text>
                    </View>
                    ))}
                </View>
                )}
            </View>
            )}
        </View>
        );
    })}

    {/* INNE AKTYWNOŚCI (CROSS-TRENING) */}
    {otherGarminEvents.map((garmin, idx) => {
        const summary = garmin.summaryObj;
        const actName = summary.activityName || 'Trening uzupełniający';
        const actType = summary.activityType;

        const gDist = summary.distanceInMeters || 0;
        const gTime = summary.durationInSeconds || 0;
        const hr = summary.averageHeartRateInBeatsPerMinute || '--';
        const maxHr = summary.maxHeartRateInBeatsPerMinute || '--';

        return (
            <View key={`other-${idx}`} style={styles.garminSection}>
        <Text style={[styles.sectionTitle, { color: '#818cf8', marginBottom: 4 }]}>
    <SportIcon activityType={actType} activityName={actName} size={15} color="#818cf8" />
        {' '} {actName.toUpperCase()}
    </Text>

        {/* LINK DO GARMIN CONNECT */}
    <TouchableOpacity
        style={styles.garminLinkBtn}
        onPress={() => openGarminConnect(summary.activityId)}
    >
    <Text style={styles.garminLinkText}>GARMIN CONNECT</Text>
    <Ionicons name="open-outline" size={14} color="#94a3b8" />
        </TouchableOpacity>

        <View style={[styles.unifiedCard, { borderColor: '#3730a3' }]}>
    <View style={styles.unifiedStatCol}>
        <Text style={styles.unifiedStatLabel}>DYSTANS</Text>
        <Text style={styles.unifiedStatValue}>
    {gDist > 0 ? formatDistanceMeters(gDist) : '--'}
        {gDist > 0 && <Text style={styles.unifiedStatUnit}> km</Text>}
            </Text>
            </View>
            <View style={styles.unifiedStatDivider} />
        <View style={styles.unifiedStatCol}>
            <Text style={styles.unifiedStatLabel}>CZAS</Text>
            <Text style={styles.unifiedStatValue}>{formatTimeSeconds(gTime)}</Text>
            </View>
            <View style={styles.unifiedStatDivider} />
        <View style={styles.unifiedStatCol}>
            <Text style={styles.unifiedStatLabel}>ŚR / MAX HR</Text>
        <Text style={styles.unifiedStatValue}>
            {hr}/{maxHr}
        </Text>
        </View>
        </View>
        </View>
        );
    })}

    {/* FEEDBACK (UKRYTY DLA DNI TYLKO CROSS-TRENINGOWYCH) */}
    {showFeedback && (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}><Ionicons name="chatbubble-ellipses" size={14} /> TWÓJ FEEDBACK</Text>
    <Text style={styles.label}>Poziom zmęczenia:</Text>
    <View style={styles.chipsContainer}>
        {FATIGUE_OPTIONS.map(opt => (
                <TouchableOpacity
            key={opt.value}
            style={[styles.chip, zmeczenie === opt.value && styles.chipActive]}
        onPress={() => setZmeczenie(opt.value)}
    >
    <Text style={[styles.chipText, zmeczenie === opt.value && styles.chipTextActive]}>{opt.label}</Text>
    </TouchableOpacity>
    ))}
    </View>

    <TextInput
        style={styles.textArea}
        multiline
        placeholder="Jak się biegło? (opcjonalnie)"
        placeholderTextColor="#475569"
        value={text}
        onChangeText={setText}
        />

        <TouchableOpacity style={[styles.saveBtn, loading && styles.disabled]} onPress={submitFeedback} disabled={loading}>
        {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.saveBtnText}>ZAPISZ W DZIENNIKU</Text>}
    </TouchableOpacity>
    </View>
    )}
</ScrollView>
    </View>
    </KeyboardAvoidingView>
    </Modal>
);
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#0f172a', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '92%', padding: 20 },

    headerArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    headerTextContainer: { flex: 1, marginRight: 15 },
    headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
    headerSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    lastUpdated: { color: '#64748b', fontSize: 12, fontWeight: '600' },
    closeBtn: { padding: 5 },

    scrollArea: { flex: 1 },
    section: { marginBottom: 25 },
    garminSection: { marginBottom: 30 },

    sectionTitle: { color: '#38bdf8', fontSize: 13, fontWeight: '800', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' },

    // Style dla przycisku linku (Zmieniony kolor tekstu na szary #94a3b8)
    garminLinkBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    garminLinkText: { color: '#94a3b8', fontSize: 11, fontWeight: '800', marginRight: 4, letterSpacing: 0.5 },

    infoBox: { backgroundColor: '#1e293b', padding: 15, borderRadius: 15, borderLeftWidth: 4, borderLeftColor: '#38bdf8' },
    infoText: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },

    unifiedCard: { backgroundColor: '#1e293b', paddingVertical: 22, paddingHorizontal: 10, borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, marginBottom: 15 },
    unifiedStatCol: { flex: 1, alignItems: 'center' },
    unifiedStatDivider: { width: 1, height: '100%', backgroundColor: '#334155' },
    unifiedStatLabel: { color: '#64748b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
    unifiedStatValue: { color: '#f8fafc', fontSize: 24, fontWeight: '900' },
    unifiedStatUnit: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },

    paramsTable: { backgroundColor: '#1e293b', borderRadius: 15, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
    paramRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#334155' },
    paramLabel: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
    paramValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
    paramUnit: { color: '#64748b', fontSize: 12, fontWeight: '600' },

    lapsContainer: { backgroundColor: '#161e2e', borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
    lapsHeaderTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#0f172a' },
    lapsTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '800' },
    table: { paddingBottom: 5 },
    tableHeaderRow: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b', backgroundColor: '#121e31' },
    tableHeaderText: { color: '#64748b', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center' },
    tableRow: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center' },
    rowOdd: { backgroundColor: '#1e293b' },
    rowEven: { backgroundColor: 'transparent' },
    tableCell: { color: '#f1f5f9', fontSize: 12, fontWeight: '600', textAlign: 'center' },

    colL: { width: 20 },
    colDyst: { width: 65 },
    colCzas: { width: 50 },
    colPace: { width: 50, fontWeight: '800' },
    colHr: { width: 40 },
    colMaxHr: { width: 40 },
    colKad: { width: 35 },
    colKrok: { width: 35 },

    label: { color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase' },
    chipsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    chip: { backgroundColor: '#1e293b', paddingVertical: 8, flex: 1, marginHorizontal: 2, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    chipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
    chipText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
    chipTextActive: { color: '#0f172a', fontWeight: '900' },
    textArea: { backgroundColor: '#1e293b', color: '#fff', padding: 15, borderRadius: 15, height: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#334155', fontSize: 15 },
    saveBtn: { backgroundColor: '#38bdf8', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 20, marginBottom: 30 },
    saveBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },
    disabled: { opacity: 0.5 }
});