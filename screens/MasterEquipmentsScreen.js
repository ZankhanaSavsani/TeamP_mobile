import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    TextInput,
    StatusBar,
    Alert,
} from 'react-native';
import axios from 'axios';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import OAuthManager from '../login/OAuthManager';
import { getBaseUrl } from '../utils/urlHelper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

// Fields requested for the equipment list (mirrors the web allEquipmentsPanel columns)
const LIST_FIELDS =
    'Name;EquipmentId;SerialNumber;Make;Model;CalibrationStatus;EquipmentStatus;Location;';


const VALID_CAL_STATUSES = new Set(['OK', 'Working', 'Not Working']);
const VALID_EQP_STATUSES = new Set([
    'Available', 'Breakdown', 'Active',
    'Preventive Maintenance', 'Preventive Maintainence', 'Preventive Maintainance',
]);

const statusStyle = (status) => {
    switch (status) {
        case 'OK':
        case 'Available':
            return { bg: '#e8f5e9', border: '#81c784', text: '#2e7d32' };
        case 'Working':
            return { bg: '#fff8e1', border: '#ffd54f', text: '#e65100' };
        case 'Not Working':
        case 'Breakdown':
            return { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' };
        case 'Preventive Maintainence':
        case 'Preventive Maintenance':
        case 'Preventive Maintainance':
            return { bg: '#fff8e1', border: '#ffd54f', text: '#e65100' };
        default:
            return { bg: '#f5f5f5', border: '#bdbdbd', text: '#555' };
    }
};

const EquipmentItem = React.memo(({ item, onPress }) => (
    <TouchableOpacity style={styles.item} onPress={() => onPress(item)}>
        <View style={styles.itemTop}>
            <Text style={styles.itemName}>{item.name || 'Unnamed Equipment'}</Text>
            <Text style={styles.itemId}>{item.equipmentId || '-'}</Text>
        </View>
        <View style={styles.itemMetaRow}>
            <Text style={styles.itemMeta}>SN: {item.serialNumber || '-'}</Text>
            <Text style={styles.itemMeta}>
                {(item.make || '-') + (item.model ? ` / ${item.model}` : '')}
            </Text>
        </View>
        <View style={styles.itemMetaRow}>
            <Text style={styles.itemMeta}>Location: {item.location || '-'}</Text>
        </View>
        <View style={styles.badgeRow}>
            {!!item.calibrationStatus && VALID_CAL_STATUSES.has(item.calibrationStatus) && (() => {
                const s = statusStyle(item.calibrationStatus);
                return (
                    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
                        <Text style={[styles.badgeText, { color: s.text }]}>{item.calibrationStatus}</Text>
                    </View>
                );
            })()}
            {!!item.equipmentStatus && VALID_EQP_STATUSES.has(item.equipmentStatus) && (() => {
                const s = statusStyle(item.equipmentStatus);
                return (
                    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
                        <Text style={[styles.badgeText, { color: s.text }]}>{item.equipmentStatus}</Text>
                    </View>
                );
            })()}
        </View>
    </TouchableOpacity>
));

const MasterEquipmentsScreen = () => {
    const [equipments, setEquipments] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    const [showScanner, setShowScanner] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [hasPermission, requestPermission] = useCameraPermissions();

    // Keep latest list available to the scan handler without re-creating it
    const equipmentsRef = useRef([]);
    const navigation = useNavigation();

    const fetchEquipments = useCallback(async () => {
        try {
            setIsLoading(true);
            const accessToken = await OAuthManager.getAccessToken();
            if (!accessToken) throw new Error('Access token not found');

            const instance = await OAuthManager.getInstance();
            const baseUrl = getBaseUrl(instance);
            const endpoint = `${baseUrl}/api/data/Equipment/list`;

            const payload = { fields: LIST_FIELDS };

            const response = await axios.post(endpoint, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            const data = response.data;
            const list = Array.isArray(data)
                ? data
                : data && Array.isArray(data.result)
                    ? data.result
                    : [];

            setEquipments(list);
            setFiltered(list);
            equipmentsRef.current = list;
        } catch (error) {
            console.error('Error fetching equipments:', error.message);
            setEquipments([]);
            setFiltered([]);
            equipmentsRef.current = [];
        } finally {
            setIsLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchEquipments();
        }, [fetchEquipments])
    );

    useEffect(() => {
        const q = searchQuery.toLowerCase();
        const data = equipments.filter((item) =>
            (item.name || '').toLowerCase().includes(q) ||
            (item.equipmentId || '').toLowerCase().includes(q) ||
            (item.serialNumber || '').toLowerCase().includes(q)
        );
        setFiltered(data);
        setCurrentPage(1);
    }, [searchQuery, equipments]);

    const openEquipment = useCallback((item) => {
        navigation.navigate('MasterEquipmentDetail', {
            equipmentId: item.id,
            equipment: item,
        });
    }, [navigation]);

    const handleOpenScanner = async () => {
        if (!hasPermission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                Alert.alert('Permission Required', 'Camera permission is required to scan equipment QR codes.');
                return;
            }
        }
        setScanned(false);
        setShowScanner(true);
    };

    const handleBarcodeScanned = ({ data }) => {
        if (scanned) return;
        setScanned(true);
        setShowScanner(false);

        // QR label content is "id\nname\nserialNumber\nequipmentId" (see web editEquipmentsPanel).
        // First line is the equipment id, but also support a plain id / equipmentId payload.
        const raw = (data || '').toString().trim();
        const scannedId = raw.split(/\r?\n/)[0].trim();

        const match = equipmentsRef.current.find(
            (e) =>
                (e.id != null && String(e.id) === scannedId) ||
                (e.equipmentId != null && String(e.equipmentId) === scannedId)
        );

        if (match) {
            openEquipment(match);
        } else if (scannedId) {
            // Not in the loaded page — let the detail screen fetch it by id.
            navigation.navigate('MasterEquipmentDetail', { equipmentId: scannedId });
        } else {
            Alert.alert('Scan Failed', 'Could not read an equipment id from the QR code.');
        }
    };

    if (showScanner) {
        return (
            <View style={styles.container}>
                <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                >
                    <View style={styles.scanOverlay}>
                        <TouchableOpacity style={styles.closeButton} onPress={() => setShowScanner(false)}>
                            <Ionicons name="close" size={32} color="white" />
                        </TouchableOpacity>
                        <View style={styles.scanFrame} />
                        <Text style={styles.scanHint}>Align the equipment QR code within the frame</Text>
                    </View>
                </CameraView>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3f4ff8" />
            </View>
        );
    }

    const totalPages = filtered.length === 0 ? 0 : Math.ceil(filtered.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filtered.length);
    const paginationInfo = totalPages === 0 ? 'Page 0 of 0' : `Page ${currentPage} of ${totalPages}`;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            <View style={styles.topRow}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, id or serial no..."
                    placeholderTextColor="gray"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                />
                <TouchableOpacity style={styles.scanButton} onPress={handleOpenScanner}>
                    <Ionicons name="qr-code-outline" size={22} color="white" />
                    <Text style={styles.scanButtonText}>Scan</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={filtered.slice(startIndex, endIndex)}
                keyExtractor={(item, index) => (item.id != null ? String(item.id) : `null-${index}`)}
                renderItem={({ item }) => <EquipmentItem item={item} onPress={openEquipment} />}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No equipment found.</Text>
                    </View>
                )}
            />

            {filtered.length > 0 && (
                <View style={styles.pagination}>
                    <TouchableOpacity
                        style={[styles.paginationButton, (currentPage === 1) && styles.disabledButton]}
                        onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                    >
                        <Text style={styles.paginationButtonText}>Previous</Text>
                    </TouchableOpacity>
                    <Text style={styles.paginationText}>{paginationInfo}</Text>
                    <TouchableOpacity
                        style={[styles.paginationButton, (currentPage === totalPages || totalPages === 0) && styles.disabledButton]}
                        onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                    >
                        <Text style={styles.paginationButtonText}>Next</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 10,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    searchInput: {
        flex: 1,
        height: 48,
        borderColor: 'gray',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 10,
        marginRight: 10,
        color: '#333',
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3f4ff8',
        paddingHorizontal: 14,
        height: 48,
        borderRadius: 6,
    },
    scanButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 6,
    },
    item: {
        backgroundColor: '#f9f9f9',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#eee',
    },
    itemTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemName: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: '#3f4ff8',
    },
    itemId: {
        fontSize: 13,
        color: '#555',
        marginLeft: 8,
    },
    itemMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    itemMeta: {
        fontSize: 13,
        color: '#444',
    },
    badgeRow: {
        flexDirection: 'row',
        marginTop: 8,
        flexWrap: 'wrap',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        borderWidth: 1,
        marginRight: 6,
        marginTop: 4,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 18,
        color: '#888',
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 10,
    },
    paginationButton: {
        backgroundColor: '#3f4ff8',
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    disabledButton: {
        backgroundColor: '#a8aef9',
    },
    paginationText: {
        color: '#333',
        fontWeight: 'bold',
        flex: 1,
        textAlign: 'center',
    },
    paginationButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    // Scanner
    camera: {
        flex: 1,
    },
    scanOverlay: {
        flex: 1,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 40,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 24,
        padding: 6,
    },
    scanFrame: {
        width: 240,
        height: 240,
        borderWidth: 3,
        borderColor: '#fff',
        borderRadius: 16,
        backgroundColor: 'transparent',
    },
    scanHint: {
        color: '#fff',
        marginTop: 20,
        fontSize: 15,
        textAlign: 'center',
        paddingHorizontal: 24,
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
});

export default MasterEquipmentsScreen;
