import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import _ from 'lodash';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  CircularProgress,
  Autocomplete,
  TextField,
  Paper,
} from '@mui/material';
import { red, green } from '@mui/material/colors';
import { Home as HomeIcon } from '@mui/icons-material';
import dbManager from './indexedDB';

function App() {
  const [matches, setMatches] = useState(null);
  const [stages, setStages] = useState(null);
  const [shooters, setShooters] = useState(null);
  const [scores, setScores] = useState(null);
  const [firstTime, setFirstTime] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: _matches } = await axios('https://us-central1-ipsc-firestore.cloudfunctions.net/get-matches');
      const ilMatches = Object
        .keys(_matches)
        .map(key => ({..._matches[key], id: key}))
        .filter(match => match.countryCode === 'IL')
        .filter(match => match.ipscLevel > 0)
        .sort((a, b) => -1 * (new Date(`${a.startDate.year}-${a.startDate.month}-${a.startDate.day}`).getTime() - new Date(`${b.startDate.year}-${b.startDate.month}-${b.startDate.day}`).getTime()));

      setFirstTime({ total: ilMatches.length, currennt: 0 });

      const _shooters = {};
      const _scores = {};
      const _stages = {};
      for (let i = 0; i < ilMatches.length; i++) {
        setFirstTime({ total: ilMatches.length, current: i });
        const match = ilMatches[i];
        try {
          const existing = await dbManager.getItem(`match_${match.id}`);
          if (existing) {
            const { shooters, scores, stages } = existing;
            _shooters[match.id] = shooters;
            _scores[match.id] = scores;
            _stages[match.id] = stages;
          } else {
            try {
              let stages = [];
              if (!_.isEmpty(match.stages)) {
                stages = (await axios(`https://us-central1-ipsc-firestore.cloudfunctions.net/get-stages?stageId=${match.stages.join(',')}`)).data;
              }

              const { data: shooters } = await axios(`https://us-central1-ipsc-firestore.cloudfunctions.net/get-shooters?matchId=${match.id}`);
              let { base, scores } = (await axios(`https://us-central1-ipsc-firestore.cloudfunctions.net/get-scores?matchId=${match.id}`)).data;
              if (base) {
                const baseData = await axios(base);
                scores = _.uniqBy([...scores, ...baseData], (s) => s.id);
              }

              const endDate = new Date(`${match.endDate.year}-${match.endDate.month}-${match.endDate.day}`);
              if (new Date().getTime() - endDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
                await dbManager.setItem(`match_${match.id}`, { shooters, scores, stages });
              }

              _shooters[match.id] = shooters;
              _scores[match.id] = scores;
              _stages[match.id] = stages;
            } catch (e) {
              console.error(`Cannot get scores for match ${match.title} (${match.id})`, e.message);
            }
          }
        } catch (dbError) {
          console.error(`Database error for match ${match.id}:`, dbError);
          // Fallback to fetching data without caching
          try {
            const { data: shooters } = await axios(`https://us-central1-ipsc-firestore.cloudfunctions.net/get-shooters?matchId=${match.id}`);
            let { base, scores } = (await axios(`https://us-central1-ipsc-firestore.cloudfunctions.net/get-scores?matchId=${match.id}`)).data;
            if (base) {
              const baseData = await axios(base);
              scores = _.uniqBy([...scores, ...baseData], (s) => s.id);
            }
            _shooters[match.id] = shooters;
            _scores[match.id] = scores;
          } catch (e) {
            console.error(`Cannot get scores for match ${match.title} (${match.id})`, e.message);
          }
        }
      }
      setShooters(_shooters);
      setScores(_scores);
      setMatches(ilMatches);
      setStages(_stages);
    })();
  }, []);

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Header */}
      <AppBar position='static'>
        <Toolbar>
          <HomeIcon sx={{ ml: 2 }} />
          <Typography variant='h6' component='div' sx={{ flexGrow: 1, textAlign: 'right' }}>
            תחרות ליורה
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Container maxWidth='lg' sx={{ mt: 4, mb: 4 }}>
        {matches && shooters && scores && (
          <Main matches={matches} shooters={shooters} scores={scores} stages={stages} />
        )}
        {!(matches && shooters && scores) && (
          <>
            {!firstTime && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                <CircularProgress />
                <Typography component='div' variant='body1' sx={{ mt: 2 }}>טוען נתונים...</Typography>
              </Box>
            )}
            {firstTime && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                <Typography component='div' variant='body1' sx={{ mt: 2 }}>טוען נתונים. נמצאו {firstTime.total} תחרויות</Typography>
                <Typography>{parseInt(firstTime.current * 100/ firstTime.total)}%</Typography>
              </Box>
            )}
          </>
        )}
      </Container>
    </Box>
  );
}

function Main({ matches, shooters, scores, stages }) {
  const [selectedShooter, setSelectedShooter] = useState(null);
  window.shooters = shooters;
  window._ = _;
  const allshooters = useMemo(() => _(shooters).values().flatten().groupBy('publicId').map((s,k) => `${k} - ${_.uniq(s.map(ss => ss.name)).join(', ')}`).value(), [shooters]);
  const shooter = Object.values(shooters).flat().find(s => selectedShooter?.startsWith(`${s.publicId} - `));

  const shooterMatchers = useMemo(() => {
    return _(matches)
      .filter(m => shooters[m.id]?.some(s => s.publicId === shooter?.publicId))
      .sortBy(m => -1 * new Date(`${m.startDate.year}-${m.startDate.month}-${m.startDate.day}`).getTime())
      .value();
  }, [shooter, scores, shooters, matches]);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Autocomplete
          options={allshooters}
          renderInput={(params) => <TextField {...params} label='חיפוש יורה...' />}
          onChange={(event, value) => {
            setSelectedShooter(value);
          }}
          value={selectedShooter}
        />
      </Box>
      {shooterMatchers?.map(m => {
        const matchShooter = shooters[m.id]?.find(s => s.publicId === shooter?.publicId);
        const latestScores = getLatestScoreForShooterPerStage({ scores: scores[m.id], numStages: stages[m.id].length, stages: stages[m.id] });
        const latestScoresForShooter = _.range(latestScores.length).map(i => latestScores[i].find(s => s.shooterId === matchShooter.id));
        const dqed = !!latestScoresForShooter.find(s => s?.dq);
        const numScored = _.compact(latestScoresForShooter).length;

        return (
          <Paper key={m.id} sx={{ mb: 2, p: 2, backgroundColor: dqed ? red[100] : numScored === stages[m.id].length ? green[50] : 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant='body1'>{m.title} - רמה {m.ipscLevel}</Typography>
              <Typography variant='body1'>{m.startDate.day}/{m.startDate.month}/{m.startDate.year}</Typography>
            </Box>
            {!dqed && (
              <Box>
                ניקוד ב-{parseInt(numScored * 100 / stages[m.id].length)}% מהתחרות
              </Box>
            )}
            {dqed && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant='body1'>
                  נפסל
                </Typography>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}

export default App;

function getLatestScoreForShooterPerStage({ scores, numStages, stages, addAllScores = false }) {
    const $scores = _(scores)
        .filter((score) => !score.deleted)
        .filter((score) => !stages || !stages[score.stageIdx - 1]?.inactive || !!score.dq)
        .groupBy('stageIdx')
        .mapValues((stageScore) => _(stageScore)
            .groupBy('shooterId')
            .mapValues((shooterScores) => {
                const sortedScores = _.uniqWith(_.sortBy(shooterScores, (s) => -1 * s.timestamp), (a, b) => _.isEqual(_.omit(a, ['id', 'editable', 'modified', 'timestamp', 'roSignature', 'signature']), _.omit(b, ['id', 'editable', 'modified', 'timestamp', 'roSignature', 'signature'])));
                return {
                    ...sortedScores[0],
                    ...(addAllScores ? {
                        numScoresEntered: sortedScores.length,
                        allScores: sortedScores,
                    } : {}),
                };
            })
            .values()
            .value())
        .value();

    const ret = _.range(numStages).map((stageNum) => $scores[stageNum + 1] || []);

    return ret;
}