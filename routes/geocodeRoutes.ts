import { Router, Request, Response } from 'express';

const router = Router();

// In-memory cache for fast lookups
const geocodeCache = new Map<string, { lat: number; lng: number; displayName: string }>();

// Verified prominent Kochi & Ernakulam coordinates
const LOCALITY_DICTIONARY: Array<{ pattern: RegExp; lat: number; lng: number; name: string }> = [
  { pattern: /millupadi|millumpadi|nest\s*(tech|road|park)/i, lat: 10.016746, lng: 76.36594, name: 'Millupadi, Nest Road, Edachira, Kakkanad' },
  { pattern: /edachira/i, lat: 10.0167, lng: 76.3692, name: 'Edachira, Kakkanad, Kochi' },
  { pattern: /infopark/i, lat: 10.0104, lng: 76.3623, name: 'Infopark, Kakkanad, Kochi' },
  { pattern: /kakkanad/i, lat: 10.0159, lng: 76.3419, name: 'Kakkanad, Kochi' },
  { pattern: /padamughal/i, lat: 10.0145, lng: 76.3360, name: 'Padamughal, Kakkanad, Kochi' },
  { pattern: /vazhakkala/i, lat: 10.0135, lng: 76.3268, name: 'Vazhakkala, Kochi' },
  { pattern: /chittethukara/i, lat: 10.0120, lng: 76.3580, name: 'Chittethukara, Kochi' },
  { pattern: /panampilly\s*nagar/i, lat: 9.9648, lng: 76.2954, name: 'Panampilly Nagar, Kochi' },
  { pattern: /marine\s*drive/i, lat: 9.9785, lng: 76.2758, name: 'Marine Drive, Kochi' },
  { pattern: /mg\s*road/i, lat: 9.9729, lng: 76.2852, name: 'MG Road, Kochi' },
  { pattern: /palarivattom/i, lat: 10.0053, lng: 76.3079, name: 'Palarivattom, Kochi' },
  { pattern: /edappally/i, lat: 10.0236, lng: 76.3117, name: 'Edappally, Kochi' },
  { pattern: /kaloor/i, lat: 9.9930, lng: 76.2930, name: 'Kaloor, Kochi' },
  { pattern: /vyttila/i, lat: 9.9686, lng: 76.3197, name: 'Vyttila, Kochi' },
  { pattern: /aluva/i, lat: 10.1076, lng: 76.3516, name: 'Aluva, Kochi' },
  { pattern: /kalamassery/i, lat: 10.0468, lng: 76.3195, name: 'Kalamassery, Kochi' },
  { pattern: /thevara/i, lat: 9.9392, lng: 76.2941, name: 'Thevara, Kochi' },
  { pattern: /tripunithura/i, lat: 9.9482, lng: 76.3447, name: 'Tripunithura, Kochi' },
  { pattern: /fort\s*kochi/i, lat: 9.9658, lng: 76.2421, name: 'Fort Kochi, Kochi' },
  { pattern: /kadavanthra/i, lat: 9.9675, lng: 76.2985, name: 'Kadavanthra, Kochi' },
  { pattern: /ravipuram/i, lat: 9.9620, lng: 76.2900, name: 'Ravipuram, Kochi' },
  { pattern: /ernakulam\s*south/i, lat: 9.9682, lng: 76.2885, name: 'Ernakulam South, Kochi' },
  { pattern: /ernakulam\s*north/i, lat: 9.9950, lng: 76.2880, name: 'Ernakulam North, Kochi' },
  { pattern: /thammanam/i, lat: 9.9880, lng: 76.3120, name: 'Thammanam, Kochi' }
];

export async function resolveAddressCoordinates(addressQuery: string): Promise<{ lat: number; lng: number; displayName: string }> {
  const query = (addressQuery || '').trim();
  if (!query) {
    return {
      lat: 10.0159,
      lng: 76.3419,
      displayName: 'Kakkanad, Kochi, Kerala'
    };
  }

  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  // 1. Check verified locality dictionary first
  for (const item of LOCALITY_DICTIONARY) {
    if (item.pattern.test(query)) {
      const result = {
        lat: item.lat,
        lng: item.lng,
        displayName: item.name
      };
      geocodeCache.set(cacheKey, result);
      return result;
    }
  }

  // 2. Clean address string: deduplicate repeated tokens and strip flat/villa/apartment numbers
  const cleanedTokens = query
    .replace(/Flat\s*\d+[A-Za-z]?|Villa\s*\d+[A-Za-z]?|Penthouse|B-\d+|A-\d+|Plot\s*\d+/gi, '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const uniqueTokens = Array.from(new Set(cleanedTokens));
  const candidateQueries: string[] = [
    uniqueTokens.join(', '),
    uniqueTokens.slice(-3).join(', '),
    uniqueTokens.slice(-2).join(', ')
  ].filter(Boolean);

  for (const q of candidateQueries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Shift24FoodApp/1.0 (dispatch@shift24food.com)',
          'Accept-Language': 'en'
        }
      });

      if (response.ok) {
        const data: any = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const result = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            displayName: data[0].display_name
          };
          geocodeCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (err) {
      console.warn('[Geocode API] Notice while querying Nominatim:', err);
    }
  }

  // 3. Fallback to default Kochi Kakkanad hub center
  const fallbackResult = {
    lat: 10.0159,
    lng: 76.3419,
    displayName: 'Kakkanad, Kochi, Kerala'
  };
  geocodeCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

router.get('/', async (req: Request, res: Response) => {
  const addressQuery = String(req.query.q || req.query.address || '').trim();

  if (!addressQuery) {
    return res.status(400).json({ success: false, message: 'Address query parameter "q" is required' });
  }

  const result = await resolveAddressCoordinates(addressQuery);
  return res.json({ success: true, data: result });
});

export default router;
